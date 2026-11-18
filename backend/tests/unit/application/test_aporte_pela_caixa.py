from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.consultar_progresso_das_metas import ConsultarProgressoDasMetas
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import TransacaoImportadaInvalida
from gastoba.domain.ganho import Ganho, OrigemDoGanho
from gastoba.domain.mes import Mes
from gastoba.domain.meta import AlvoDaMeta, Meta, SituacaoDaMeta
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)

USUARIO_ID = uuid4()
DIA = date(2026, 10, 10)


def preparar(uow, sentido=SentidoDaTransacao.SAIDA, valor=100000):
    conta = Conta(USUARIO_ID, "Banco", Dinheiro(500000), origem=OrigemDaConta.OPEN_FINANCE)
    transacao = TransacaoImportada(
        conta.id, "ext-1", DIA, "Aplicação LCI", Dinheiro(valor), sentido
    )
    with uow as u:
        u.contas.adicionar(conta)
        u.transacoes_importadas.adicionar_se_nova(transacao)
        u.commit()
    return conta, transacao


def aceitar(uow, transacao, categoria=None, tags=(), como_investimento=True):
    return AceitarTransacaoImportada(uow).executar(
        USUARIO_ID, transacao.id, categoria, list(tags), como_investimento=como_investimento
    )


def test_saida_aceita_como_aporte_nao_cria_gasto_nem_mexe_no_saldo(unidade_de_trabalho):
    conta, t = preparar(unidade_de_trabalho)

    resultado = aceitar(unidade_de_trabalho, t)

    assert isinstance(resultado, MovimentoDeInvestimento)
    assert resultado.tipo == TipoDeMovimento.APORTE
    assert (resultado.valor, resultado.data, resultado.conta_id) == (
        Dinheiro(100000),
        DIA,
        conta.id,
    )
    estado = unidade_de_trabalho.confirmado
    assert estado.gastos == {}
    assert resultado.id in estado.movimentos_de_investimento
    assert estado.transacoes_importadas[t.id].estado == EstadoDaTransacaoImportada.ACEITA
    assert estado.contas[conta.id].saldo == Dinheiro(500000)


def test_entrada_aceita_como_investimento_vira_resgate_e_nao_ganho(unidade_de_trabalho):
    _, t = preparar(unidade_de_trabalho, SentidoDaTransacao.ENTRADA)

    resultado = aceitar(unidade_de_trabalho, t)

    assert resultado.tipo == TipoDeMovimento.RESGATE
    assert unidade_de_trabalho.confirmado.ganhos == {}


def test_aporte_com_categoria_e_recusado(unidade_de_trabalho):
    conta, t = preparar(unidade_de_trabalho)
    with pytest.raises(TransacaoImportadaInvalida):
        aceitar(unidade_de_trabalho, t, categoria=CategoriaDoGasto.CONFORTO)
    assert not unidade_de_trabalho.confirmado.movimentos_de_investimento
    assert unidade_de_trabalho.confirmado.gastos == {}
    assert unidade_de_trabalho.confirmado.contas[conta.id].saldo == conta.saldo


@pytest.mark.parametrize(
    "sentido,categoria,tags",
    [
        (SentidoDaTransacao.ENTRADA, CategoriaDoGasto.CONFORTO, ()),
        (SentidoDaTransacao.SAIDA, None, ("loja",)),
    ],
)
def test_movimento_recusa_categoria_no_resgate_e_tags(
    unidade_de_trabalho, sentido, categoria, tags
):
    _, t = preparar(unidade_de_trabalho, sentido)
    with pytest.raises(TransacaoImportadaInvalida):
        aceitar(unidade_de_trabalho, t, categoria=categoria, tags=tags)
    assert not unidade_de_trabalho.confirmado.movimentos_de_investimento


def test_aporte_nao_entra_em_ganho_nem_gasto_da_categoria_mas_conta_na_meta_de_investir(
    unidade_de_trabalho,
):
    conta, t = preparar(unidade_de_trabalho, valor=100000)
    with unidade_de_trabalho as u:
        u.ganhos.adicionar(
            Ganho(conta.id, Dinheiro(500000), "Salário", DIA, origem=OrigemDoGanho.MANUAL)
        )
        u.metas.salvar(Meta(USUARIO_ID, AlvoDaMeta.LIBERDADE_FINANCEIRA, 10))
        u.commit()
    aceitar(unidade_de_trabalho, t)

    resumo = ConsultarProgressoDasMetas(unidade_de_trabalho).executar(USUARIO_ID, Mes(2026, 10))

    meta = resumo.progressos[0]
    assert resumo.renda == Dinheiro(500000)
    assert meta.gasto == Dinheiro(100000)
    assert meta.situacao == SituacaoDaMeta.ESTOUROU


def test_resgate_nao_conta_como_aporte_na_meta(unidade_de_trabalho):
    conta, t = preparar(unidade_de_trabalho, SentidoDaTransacao.ENTRADA)
    with unidade_de_trabalho as u:
        u.metas.salvar(Meta(USUARIO_ID, AlvoDaMeta.LIBERDADE_FINANCEIRA, 10))
        u.commit()
    aceitar(unidade_de_trabalho, t)

    resumo = ConsultarProgressoDasMetas(unidade_de_trabalho).executar(USUARIO_ID, Mes(2026, 10))

    assert resumo.progressos[0].gasto == Dinheiro(0)


@pytest.mark.parametrize("fluxo", ["unico", "lote", "dividido"])
@pytest.mark.parametrize("marcador", [False, True])
def test_categoria_legada_recusada_em_todos_os_aceites(unidade_de_trabalho, fluxo, marcador):
    from gastoba.application.aceitar_transacao_importada_dividida import (
        AceitarTransacaoImportadaDividida,
    )
    from gastoba.application.aceitar_transacoes_importadas_em_lote import (
        AceitarTransacoesImportadasEmLote,
    )
    from gastoba.domain.divisao_da_transacao import ParteDaTransacao
    from gastoba.domain.excecoes import CategoriaInvalida

    _, t = preparar(unidade_de_trabalho)
    with pytest.raises(CategoriaInvalida):
        if fluxo == "unico":
            aceitar(
                unidade_de_trabalho, t, CategoriaDoGasto.INVESTIMENTOS, como_investimento=marcador
            )
        elif fluxo == "lote":
            AceitarTransacoesImportadasEmLote(unidade_de_trabalho).executar(
                USUARIO_ID, [t.id], CategoriaDoGasto.INVESTIMENTOS, [], como_investimento=marcador
            )
        else:
            AceitarTransacaoImportadaDividida(unidade_de_trabalho).executar(
                USUARIO_ID,
                t.id,
                [
                    ParteDaTransacao(CategoriaDoGasto.INVESTIMENTOS, (), 50),
                    ParteDaTransacao(CategoriaDoGasto.LAZER, (), 50),
                ],
            )
    assert (
        unidade_de_trabalho.confirmado.transacoes_importadas[t.id].estado
        == EstadoDaTransacaoImportada.PENDENTE
    )
