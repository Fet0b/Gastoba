from dataclasses import asdict
from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.aceitar_transacao_importada_dividida import (
    AceitarTransacaoImportadaDividida,
)
from gastoba.application.desfazer_classificacao_de_investimento import (
    DesfazerClassificacaoDeInvestimento,
)
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.divisao_da_transacao import ParteDaTransacao
from gastoba.domain.excecoes import (
    DivisaoExigeConfirmacao,
    MovimentoDeInvestimentoNaoEncontrado,
    MovimentoNaoDesfazivel,
    PrincipalInsuficiente,
)
from gastoba.domain.ganho import Ganho, OrigemDoGanho
from gastoba.domain.gasto import Gasto, OrigemDoGasto
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    OrigemDoMovimento,
)
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)

USUARIO = uuid4()
DIA = date(2026, 10, 5)


def montar(uow, sentido=SentidoDaTransacao.SAIDA, *, legado=False, dividir=False, destinar=False):
    conta = Conta(USUARIO, "Banco exemplo", Dinheiro(12345), origem=OrigemDaConta.OPEN_FINANCE)
    transacao = TransacaoImportada(
        conta.id, "t-exemplo", DIA, "Movimento exemplo", Dinheiro(10000), sentido
    )
    with uow as u:
        u.contas.adicionar(conta)
        u.transacoes_importadas.adicionar_se_nova(transacao)
        u.investimentos.salvar_posicao(
            USUARIO,
            InvestimentoExterno(
                "i1", "Investimento exemplo", "FIXED_INCOME", None, Dinheiro(10000), "{}"
            ),
        )
        u.commit()
    with uow as u:
        investimento = u.investimentos.listar_posicoes(USUARIO)[0]
    destinos = [Destinacao(Tag("reserva"), 100)] if destinar else []
    if dividir:
        partes = [
            ParteDaTransacao(CategoriaDoGasto.LAZER, (), 30),
            ParteDaTransacao(
                None,
                (),
                30,
                investimento.id if destinar else None,
                tuple(destinos),
                como_investimento=True,
            ),
            ParteDaTransacao(
                None,
                (),
                40,
                investimento.id if destinar else None,
                tuple(destinos),
                como_investimento=True,
            ),
        ]
        criados = AceitarTransacaoImportadaDividida(uow).executar(USUARIO, transacao.id, partes)
        movimento = criados[1]
    else:
        movimento = AceitarTransacaoImportada(uow).executar(
            USUARIO,
            transacao.id,
            None,
            [],
            como_investimento=True,
            investimento_id=investimento.id if destinar else None,
            destinacoes=destinos,
        )
    if legado:
        uow.confirmado.movimentos_de_investimento[movimento.id].transacao_importada_id = None
    return conta, transacao, movimento, investimento


def desfazer(uow, movimento, **opcoes):
    return DesfazerClassificacaoDeInvestimento(uow).executar(
        USUARIO, movimento.id, caixa_de_entrada_disponivel=True, **opcoes
    )


@pytest.mark.parametrize("sentido", list(SentidoDaTransacao))
@pytest.mark.parametrize("legado", [False, True])
def test_desfaz_aporte_e_resgate_com_vinculo_ou_correspondencia_segura(
    unidade_de_trabalho, sentido, legado
):
    conta, transacao, movimento, _ = montar(unidade_de_trabalho, sentido, legado=legado)
    antes = asdict(unidade_de_trabalho.confirmado.transacoes_importadas[transacao.id])
    resultado = desfazer(unidade_de_trabalho, movimento)
    estado = unidade_de_trabalho.confirmado
    assert movimento.id not in estado.movimentos_de_investimento
    assert estado.transacoes_importadas[transacao.id].estado == EstadoDaTransacaoImportada.PENDENTE
    antes["estado"] = EstadoDaTransacaoImportada.PENDENTE
    assert asdict(estado.transacoes_importadas[transacao.id]) == antes
    assert estado.contas[conta.id].saldo == Dinheiro(12345)
    assert resultado is not None
    assert resultado.transacao_id == transacao.id
    assert resultado.lancamentos_removidos == 1
    with pytest.raises(MovimentoDeInvestimentoNaoEncontrado):
        desfazer(unidade_de_trabalho, movimento)
    # A pessoa decide de novo: o mesmo aceite funciona após reabrir.
    novo = AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO,
        transacao.id,
        CategoriaDoGasto.LAZER if sentido == SentidoDaTransacao.SAIDA else None,
        [],
    )
    assert isinstance(novo, Gasto if sentido == SentidoDaTransacao.SAIDA else Ganho)


def test_sem_caixa_bloqueia_antes_de_abrir_a_unidade_de_trabalho():
    class Proibida:
        def __enter__(self):
            raise AssertionError("Não deve ler dados sem caixa disponível")

    with pytest.raises(MovimentoNaoDesfazivel, match="caixa de entrada"):
        DesfazerClassificacaoDeInvestimento(Proibida()).executar(
            USUARIO, uuid4(), caixa_de_entrada_disponivel=False
        )


@pytest.mark.parametrize(
    "regra",
    [
        "ausente",
        "outra_pessoa",
        "manual",
        "saldo_inicial",
        "sem_transacao",
        "pendente",
        "ignorada",
        "conta_manual",
        "recorrencia",
        "soma",
    ],
)
def test_bloqueios_nao_mudam_nenhum_registro(unidade_de_trabalho, regra):
    _, transacao, movimento, investimento = montar(unidade_de_trabalho)
    estado = unidade_de_trabalho.confirmado
    m = estado.movimentos_de_investimento[movimento.id]
    usuario_id, movimento_id = USUARIO, movimento.id
    erro = MovimentoNaoDesfazivel
    if regra == "ausente":
        movimento_id, erro = uuid4(), MovimentoDeInvestimentoNaoEncontrado
    if regra == "outra_pessoa":
        usuario_id, erro = uuid4(), MovimentoDeInvestimentoNaoEncontrado
    if regra == "manual":
        m.origem = OrigemDoMovimento.MANUAL
    if regra == "saldo_inicial":
        m.origem, m.conta_id, m.investimento_id = (
            OrigemDoMovimento.SALDO_INICIAL,
            None,
            investimento.id,
        )
    if regra == "sem_transacao":
        del estado.transacoes_importadas[transacao.id]
    if regra in ["pendente", "ignorada"]:
        estado.transacoes_importadas[transacao.id].estado = EstadoDaTransacaoImportada(regra)
    if regra == "conta_manual":
        estado.contas[m.conta_id].origem = OrigemDaConta.MANUAL
    if regra == "recorrencia":
        gasto = Gasto(
            m.conta_id,
            Dinheiro(1),
            "Parte exemplo",
            DIA,
            CategoriaDoGasto.LAZER,
            recorrencia_id=uuid4(),
            transacao_importada_id=transacao.id,
        )
        estado.gastos[gasto.id] = gasto
        m.valor = Dinheiro(9999)
    if regra == "soma":
        m.valor = Dinheiro(9999)
    antes = asdict(estado)
    with pytest.raises(erro):
        DesfazerClassificacaoDeInvestimento(unidade_de_trabalho).executar(
            usuario_id, movimento_id, caixa_de_entrada_disponivel=True
        )
    assert asdict(unidade_de_trabalho.confirmado) == antes


@pytest.mark.parametrize(
    "regra",
    [
        "nenhuma",
        "duas_transacoes",
        "dois_movimentos",
        "movimento_manual_igual",
        "gasto_igual",
        "ganho_igual",
        "vinculo_gasto",
        "vinculo_ganho",
        "vinculo_movimento",
        "divisao_antiga",
    ],
)
def test_correspondencia_ambigua_ou_insegura_nao_escreve(unidade_de_trabalho, regra):
    conta, transacao, movimento, _ = montar(unidade_de_trabalho, legado=True)
    estado = unidade_de_trabalho.confirmado
    if regra == "nenhuma":
        del estado.transacoes_importadas[transacao.id]
    if regra == "duas_transacoes":
        outra = TransacaoImportada(
            conta.id,
            "outra",
            DIA,
            transacao.descricao,
            transacao.valor,
            transacao.sentido,
            estado=EstadoDaTransacaoImportada.ACEITA,
        )
        estado.transacoes_importadas[outra.id] = outra
    if regra in ["dois_movimentos", "movimento_manual_igual", "vinculo_movimento"]:
        outro = MovimentoDeInvestimento(
            conta.id,
            movimento.tipo,
            movimento.valor,
            movimento.descricao,
            DIA,
            origem=OrigemDoMovimento.MANUAL
            if regra == "movimento_manual_igual"
            else OrigemDoMovimento.OPEN_FINANCE,
            transacao_importada_id=transacao.id if regra == "vinculo_movimento" else None,
        )
        estado.movimentos_de_investimento[outro.id] = outro
    if regra in ["gasto_igual", "vinculo_gasto"]:
        gasto = Gasto(
            conta.id,
            transacao.valor,
            transacao.descricao,
            DIA,
            CategoriaDoGasto.LAZER,
            origem=OrigemDoGasto.OPEN_FINANCE,
            transacao_importada_id=transacao.id if regra == "vinculo_gasto" else None,
        )
        estado.gastos[gasto.id] = gasto
    if regra in ["ganho_igual", "vinculo_ganho"]:
        ganho = Ganho(
            conta.id,
            transacao.valor,
            transacao.descricao,
            DIA,
            origem=OrigemDoGanho.OPEN_FINANCE,
            transacao_importada_id=transacao.id if regra == "vinculo_ganho" else None,
        )
        estado.ganhos[ganho.id] = ganho
    if regra == "divisao_antiga":
        estado.movimentos_de_investimento[movimento.id].descricao += " (1/2)"
    antes = asdict(estado)
    with pytest.raises(MovimentoNaoDesfazivel) as capturada:
        desfazer(unidade_de_trabalho, movimento)
    if regra == "divisao_antiga":
        assert "divisão" in str(capturada.value).lower()
    assert asdict(unidade_de_trabalho.confirmado) == antes


def test_divisao_exige_confirmacao_e_remove_todas_as_partes_e_destinacoes(unidade_de_trabalho):
    conta, transacao, movimento, _ = montar(unidade_de_trabalho, dividir=True, destinar=True)
    antes = asdict(unidade_de_trabalho.confirmado)
    with pytest.raises(DivisaoExigeConfirmacao) as capturada:
        desfazer(unidade_de_trabalho, movimento)
    mensagem = str(capturada.value)
    assert "3 partes" in mensagem and "1 gasto" in mensagem and "2 aportes" in mensagem
    assert transacao.descricao not in mensagem
    assert "100.00" not in mensagem
    assert asdict(unidade_de_trabalho.confirmado) == antes
    resultado = desfazer(unidade_de_trabalho, movimento, desfazer_divisao_inteira=True)
    estado = unidade_de_trabalho.confirmado
    assert (
        estado.gastos == {} and estado.movimentos_de_investimento == {} and estado.destinacoes == []
    )
    assert estado.contas[conta.id].saldo == Dinheiro(12345)
    assert estado.transacoes_importadas[transacao.id].estado == EstadoDaTransacaoImportada.PENDENTE
    assert resultado.lancamentos_removidos == 3


@pytest.mark.parametrize("dividir", [False, True])
def test_principal_usado_bloqueia_inclusive_somando_aportes_da_mesma_tag(
    unidade_de_trabalho, dividir
):
    conta, _, movimento, investimento = montar(unidade_de_trabalho, dividir=dividir, destinar=True)
    outra = TransacaoImportada(
        conta.id, "resgate", DIA, "Resgate exemplo", Dinheiro(3000), SentidoDaTransacao.ENTRADA
    )
    with unidade_de_trabalho as u:
        u.transacoes_importadas.adicionar_se_nova(outra)
        u.commit()
    AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO,
        outra.id,
        None,
        [],
        como_investimento=True,
        investimento_id=investimento.id,
        destinacoes=[Destinacao(Tag("reserva"), 100)],
    )
    antes = asdict(unidade_de_trabalho.confirmado)
    with pytest.raises(PrincipalInsuficiente):
        desfazer(unidade_de_trabalho, movimento, desfazer_divisao_inteira=True)
    assert asdict(unidade_de_trabalho.confirmado) == antes


def test_desfazer_resgate_devolve_o_principal(unidade_de_trabalho):
    conta, _, _, investimento = montar(unidade_de_trabalho, destinar=True)
    transacao = TransacaoImportada(
        conta.id, "resgate", DIA, "Resgate exemplo", Dinheiro(3000), SentidoDaTransacao.ENTRADA
    )
    with unidade_de_trabalho as u:
        u.transacoes_importadas.adicionar_se_nova(transacao)
        u.commit()
    movimento = AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO,
        transacao.id,
        None,
        [],
        como_investimento=True,
        investimento_id=investimento.id,
        destinacoes=[Destinacao(Tag("reserva"), 100)],
    )
    desfazer(unidade_de_trabalho, movimento)
    with unidade_de_trabalho as u:
        assert u.destinacoes.principais(USUARIO)[investimento.id][Tag("reserva")] == Dinheiro(10000)


def test_falha_apos_remover_partes_faz_rollback_integral(unidade_de_trabalho, monkeypatch):
    _, _, movimento, _ = montar(unidade_de_trabalho, dividir=True, destinar=True)
    antes = asdict(unidade_de_trabalho.confirmado)
    with unidade_de_trabalho as u:
        classe = type(u.transacoes_importadas)
    original = classe.atualizar_estado

    def falhar(self, transacao):
        original(self, transacao)
        raise RuntimeError("Falha simulada após remover os lançamentos")

    monkeypatch.setattr(classe, "atualizar_estado", falhar)
    with pytest.raises(RuntimeError, match="Falha simulada"):
        desfazer(unidade_de_trabalho, movimento, desfazer_divisao_inteira=True)
    assert asdict(unidade_de_trabalho.confirmado) == antes


def test_aporte_unico_remove_destinacoes_e_preserva_lancamentos_fora_do_grupo(unidade_de_trabalho):
    conta, transacao, movimento, investimento = montar(unidade_de_trabalho, destinar=True)
    gasto = Gasto(conta.id, Dinheiro(250), "Gasto exemplo", DIA, CategoriaDoGasto.LAZER)
    ganho = Ganho(conta.id, Dinheiro(1000), "Ganho exemplo", DIA)
    with unidade_de_trabalho as u:
        u.gastos.adicionar(gasto)
        u.ganhos.adicionar(ganho)
        u.commit()
    antes = asdict(unidade_de_trabalho.confirmado)
    resultado = desfazer(unidade_de_trabalho, movimento, desfazer_divisao_inteira=True)
    depois = asdict(unidade_de_trabalho.confirmado)
    assert resultado.lancamentos_removidos == 1
    assert depois["gastos"] == antes["gastos"] and depois["ganhos"] == antes["ganhos"]
    assert depois["contas"] == antes["contas"] and depois["investimentos"] == antes["investimentos"]
    assert depois["destinacoes"] == []
    assert (
        unidade_de_trabalho.confirmado.transacoes_importadas[transacao.id].estado
        == EstadoDaTransacaoImportada.PENDENTE
    )
    with unidade_de_trabalho as u:
        assert u.destinacoes.principais(USUARIO).get(investimento.id, {}) == {}


def test_nao_desfaz_aporte_que_sustenta_cobertura(unidade_de_trabalho):
    from gastoba.domain.cobertura_de_compra import CoberturaDeCompra

    _, _, m, _ = montar(unidade_de_trabalho, destinar=True)
    unidade_de_trabalho.confirmado.movimentos_de_investimento[
        m.id
    ].categoria = CategoriaDoGasto.CONFORTO
    g = Gasto(m.conta_id, Dinheiro(8000), "Compra fictícia", DIA, CategoriaDoGasto.CONFORTO, ())
    with unidade_de_trabalho as u:
        u.gastos.adicionar(g)
        u.coberturas.adicionar(CoberturaDeCompra(g.id, Tag("reserva"), Dinheiro(3000)))
        u.commit()
    antes = asdict(unidade_de_trabalho.confirmado)
    with pytest.raises(MovimentoNaoDesfazivel, match="reserva"):
        desfazer(unidade_de_trabalho, m)
    assert asdict(unidade_de_trabalho.confirmado) == antes


def test_resgate_que_paga_compra_nao_pode_ser_desfeito(unidade_de_trabalho):
    from gastoba.domain.cobertura_de_compra import CoberturaDeCompra

    # A guarda não depende do tipo do movimento; o aporte é o que a montagem consegue destinar.
    conta, _, movimento, _ = montar(unidade_de_trabalho, SentidoDaTransacao.SAIDA, destinar=True)
    compra = Gasto(conta.id, Dinheiro(10000), "Compra fictícia", DIA, CategoriaDoGasto.CONFORTO, ())
    cobertura = CoberturaDeCompra(
        compra.id, Tag("reserva"), Dinheiro(1000), movimento_id=movimento.id
    )
    with unidade_de_trabalho as u:
        u.gastos.adicionar(compra)
        u.coberturas.adicionar(cobertura)
        u.commit()
    with pytest.raises(MovimentoNaoDesfazivel):
        desfazer(unidade_de_trabalho, movimento)
    assert movimento.id in unidade_de_trabalho.confirmado.movimentos_de_investimento
    with unidade_de_trabalho as u:
        u.coberturas.remover(cobertura.id)
        u.commit()
    desfazer(unidade_de_trabalho, movimento)
    assert movimento.id not in unidade_de_trabalho.confirmado.movimentos_de_investimento
