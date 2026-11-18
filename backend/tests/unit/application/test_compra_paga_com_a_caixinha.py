from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.associar_compra_a_destinacao import AssociarCompraADestinacao
from gastoba.application.consultar_progresso_das_metas import ConsultarProgressoDasMetas
from gastoba.application.desassociar_compra_da_destinacao import DesassociarCompraDaDestinacao
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.destinacao import ParteDeDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    CoberturaInvalida,
    CoberturaJaExiste,
    GastoNaoEncontrado,
    MovimentoDeInvestimentoNaoEncontrado,
)
from gastoba.domain.gasto import Gasto
from gastoba.domain.mes import Mes
from gastoba.domain.meta import AlvoDaMeta, Meta
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag

DONO, OUTRA = uuid4(), uuid4()
CONFORTO = CategoriaDoGasto.CONFORTO
COMPUTADOR = Tag("computador")


class Cenario:
    """Aporte de R$ 3.500 em outubro, resgate de R$ 3.700 em novembro e compra de R$ 4.200."""

    def __init__(self, uow, *, vincular=True, aportar=True):
        self.uow = uow
        self.conta = Conta(DONO, "Banco", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE)
        self.compra = Gasto(
            self.conta.id, Dinheiro(420000), "Computador", date(2026, 11, 5), CONFORTO, ()
        )
        externo = InvestimentoExterno("lci", "LCI", "FIXED_INCOME", None, Dinheiro(370000), "{}")
        with uow as u:
            u.contas.adicionar(self.conta)
            u.investimentos.salvar_posicao(DONO, externo)
            u.gastos.adicionar(self.compra)
            u.metas.salvar(Meta(DONO, AlvoDaMeta.CONFORTO, 18))
            u.renda_base.definir(DONO, Dinheiro(530000))
            u.commit()
        with uow as u:
            self.investimento = u.investimentos.listar_posicoes(DONO)[0]
        if aportar:
            self.aporte = self._movimento(TipoDeMovimento.APORTE, 350000, date(2026, 10, 10))
        self.resgate = self.resgatar("computador", 370000, 350000)

    def _movimento(self, tipo, valor, dia):
        m = MovimentoDeInvestimento(
            self.conta.id, tipo, Dinheiro(valor), "Movimento", dia, self.investimento.id
        )
        with self.uow as u:
            u.movimentos_de_investimento.adicionar(m)
            sinal = 1 if tipo is TipoDeMovimento.APORTE else -1
            parte = (
                ParteDeDestinacao(COMPUTADOR, Dinheiro(sinal * valor), categoria=None)
                if sinal > 0
                else ParteDeDestinacao(COMPUTADOR, Dinheiro(-valor), Dinheiro(-350000))
            )
            u.destinacoes.adicionar(m.id, [parte])
            u.commit()
        return m

    def resgatar(self, tag, valor, principal):
        m = MovimentoDeInvestimento(
            self.conta.id,
            TipoDeMovimento.RESGATE,
            Dinheiro(valor),
            "Resgate",
            date(2026, 11, 5),
            self.investimento.id,
        )
        with self.uow as u:
            u.movimentos_de_investimento.adicionar(m)
            u.destinacoes.adicionar(
                m.id, [ParteDeDestinacao(Tag(tag), Dinheiro(-valor), Dinheiro(-principal))]
            )
            u.commit()
        return m

    def cobrir(self, valor, *, resgate=None, usuario=DONO, tag="computador", gasto=None):
        return AssociarCompraADestinacao(self.uow).executar(
            usuario,
            (gasto or self.compra).id,
            tag,
            Dinheiro(valor),
            (resgate or self.resgate).id,
        )

    def novembro(self):
        resumo = ConsultarProgressoDasMetas(self.uow).executar(DONO, Mes(2026, 11))
        return resumo.progressos[0]


def test_exemplo_da_historia_aumenta_o_limite_e_o_excedente_conta(unidade_de_trabalho):
    c = Cenario(unidade_de_trabalho)
    cobertura = c.cobrir(370000)
    assert (cobertura.movimento_id, cobertura.principal) == (c.resgate.id, Dinheiro(350000))
    meta = c.novembro()
    assert meta.limite == Dinheiro(95400)
    assert meta.adicional == Dinheiro(370000)
    assert meta.gasto_bruto == Dinheiro(420000)
    assert meta.gasto == Dinheiro(50000)  # o excedente de R$ 500 conta normalmente
    assert meta.situacao.value == "dentro"
    assert [(str(k.tag), k.valor) for k in meta.caixinhas] == [("computador", Dinheiro(370000))]


def test_nao_cria_resgate_nem_mexe_em_saldo_ou_principal(unidade_de_trabalho):
    c = Cenario(unidade_de_trabalho)
    antes = (
        len(unidade_de_trabalho.confirmado.movimentos_de_investimento),
        list(unidade_de_trabalho.confirmado.destinacoes),
        unidade_de_trabalho.confirmado.contas[c.conta.id].saldo,
    )
    c.cobrir(100000)
    estado = unidade_de_trabalho.confirmado
    assert (
        len(estado.movimentos_de_investimento),
        list(estado.destinacoes),
        estado.contas[c.conta.id].saldo,
    ) == antes


def test_valor_acima_do_resgate_ou_da_compra_e_recusado(unidade_de_trabalho):
    c = Cenario(unidade_de_trabalho)
    with pytest.raises(CoberturaInvalida):
        c.cobrir(370001)
    c.cobrir(200000)
    with pytest.raises(CoberturaJaExiste):
        c.cobrir(170000)  # a tag já cobre a compra: desfaz-se antes de alterar
    assert unidade_de_trabalho.confirmado.coberturas  # a primeira ficou


def test_duas_compras_disputam_o_mesmo_resgate(unidade_de_trabalho):
    c = Cenario(unidade_de_trabalho)
    outra = Gasto(c.conta.id, Dinheiro(100000), "Mouse", date(2026, 11, 6), CONFORTO, ())
    with unidade_de_trabalho as u:
        u.gastos.adicionar(outra)
        u.commit()
    c.cobrir(300000)
    with pytest.raises(CoberturaInvalida):
        c.cobrir(70001, gasto=outra)
    c.cobrir(70000, gasto=outra)


def test_resgate_cobre_compra_sem_categoria_historica(unidade_de_trabalho):
    c = Cenario(unidade_de_trabalho, vincular=False, aportar=True)
    c.cobrir(370000)
    assert c.novembro().adicional == Dinheiro(370000)


def test_resgate_sem_a_tag_ou_sem_tag_nenhuma_nao_serve(unidade_de_trabalho):
    c = Cenario(unidade_de_trabalho)
    outro = c.resgatar("viagem", 1000, 1000)
    with pytest.raises(CoberturaInvalida):
        c.cobrir(1000, resgate=outro)
    sem_tag = MovimentoDeInvestimento(
        c.conta.id, TipoDeMovimento.RESGATE, Dinheiro(500), "Saque", date(2026, 11, 5)
    )
    with unidade_de_trabalho as u:
        u.movimentos_de_investimento.adicionar(sem_tag)
        u.commit()
    with pytest.raises(CoberturaInvalida):
        c.cobrir(500, resgate=sem_tag)


def test_aporte_nao_paga_compra(unidade_de_trabalho):
    c = Cenario(unidade_de_trabalho)
    with pytest.raises(CoberturaInvalida):
        c.cobrir(100, resgate=c.aporte)


def test_tag_vinculada_exige_o_resgate(unidade_de_trabalho):
    c = Cenario(unidade_de_trabalho)
    with pytest.raises(CoberturaInvalida):
        AssociarCompraADestinacao(unidade_de_trabalho).executar(
            DONO, c.compra.id, "computador", Dinheiro(1000)
        )


def test_isolamento_entre_pessoas(unidade_de_trabalho):
    c = Cenario(unidade_de_trabalho)
    with pytest.raises(GastoNaoEncontrado):
        c.cobrir(1000, usuario=OUTRA)
    outro_gasto_inexistente = Gasto(
        c.conta.id, Dinheiro(1), "Inexistente", date(2026, 11, 5), CONFORTO, ()
    )
    with pytest.raises(GastoNaoEncontrado):
        c.cobrir(1, gasto=outro_gasto_inexistente)
    with pytest.raises(MovimentoDeInvestimentoNaoEncontrado):
        AssociarCompraADestinacao(unidade_de_trabalho).executar(
            DONO, c.compra.id, "computador", Dinheiro(1), uuid4()
        )


def test_desfazer_a_cobertura_libera_o_saldo_do_resgate(unidade_de_trabalho):
    c = Cenario(unidade_de_trabalho)
    cobertura = c.cobrir(370000)
    with pytest.raises(CoberturaJaExiste):
        c.cobrir(1)
    DesassociarCompraDaDestinacao(unidade_de_trabalho).executar(DONO, c.compra.id, cobertura.id)
    assert c.novembro().adicional == Dinheiro(0)
    c.cobrir(370000)
    assert len(unidade_de_trabalho.confirmado.movimentos_de_investimento) == 2
