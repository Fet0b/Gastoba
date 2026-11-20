"""IOF e IRRF só são imposto de investimento na conta investimentos (071, D4)."""

from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.aceitar_transacao_importada_dividida import (
    AceitarTransacaoImportadaDividida,
)
from gastoba.application.aceitar_transacoes_importadas_em_lote import (
    AceitarTransacoesImportadasEmLote,
)
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.conta import Conta, OrigemDaConta, TipoDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.divisao_da_transacao import ParteDaTransacao
from gastoba.domain.excecoes import TransacaoImportadaInvalida
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

USUARIO = uuid4()
HOJE = date(2026, 11, 5)
DESCRICAO = "IOF DESPESA NO EXTERIOR"


def _montar(uow, tipo):
    conta = Conta(
        USUARIO, f"Conta {tipo.value}", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE, tipo=tipo
    )
    transacao = TransacaoImportada(
        conta.id, "iof", HOJE, DESCRICAO, Dinheiro(413), SentidoDaTransacao.SAIDA
    )
    with uow as u:
        u.contas.adicionar(conta)
        u.transacoes_importadas.adicionar_se_nova(transacao)
        u.commit()
    return transacao


def _gastos(uow):
    with uow as u:
        return u.gastos.listar(USUARIO, date(2026, 1, 1), date(2026, 12, 31))


@pytest.mark.parametrize("tipo", [TipoDaConta.CORRENTE, TipoDaConta.CARTAO])
def test_iof_fora_da_conta_investimentos_e_aceito_como_gasto(unidade_de_trabalho, tipo):
    transacao = _montar(unidade_de_trabalho, tipo)

    AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO, transacao.id, CategoriaDoGasto.LAZER, []
    )

    assert [g.descricao for g in _gastos(unidade_de_trabalho)] == [DESCRICAO]


def test_iof_na_conta_investimentos_continua_recusado_como_gasto(unidade_de_trabalho):
    transacao = _montar(unidade_de_trabalho, TipoDaConta.REMUNERADA)

    with pytest.raises(TransacaoImportadaInvalida):
        AceitarTransacaoImportada(unidade_de_trabalho).executar(
            USUARIO, transacao.id, CategoriaDoGasto.LAZER, []
        )
    assert _gastos(unidade_de_trabalho) == []


def test_lote_aceita_o_iof_fora_da_conta_investimentos_e_recusa_nela(unidade_de_trabalho):
    corrente = _montar(unidade_de_trabalho, TipoDaConta.CORRENTE)
    remunerada = _montar(unidade_de_trabalho, TipoDaConta.REMUNERADA)
    lote = AceitarTransacoesImportadasEmLote(unidade_de_trabalho)

    with pytest.raises(TransacaoImportadaInvalida):
        lote.executar(USUARIO, [corrente.id, remunerada.id], CategoriaDoGasto.LAZER, [])
    assert _gastos(unidade_de_trabalho) == []  # tudo ou nada

    lote.executar(USUARIO, [corrente.id], CategoriaDoGasto.LAZER, [])
    assert len(_gastos(unidade_de_trabalho)) == 1


def _partes():
    return [
        ParteDaTransacao(CategoriaDoGasto.LAZER, (), 50),
        ParteDaTransacao(CategoriaDoGasto.CONFORTO, (), 50),
    ]


def test_dividir_o_iof_fora_da_conta_investimentos_e_aceito_e_na_conta_investimentos_recusado(
    unidade_de_trabalho,
):
    corrente = _montar(unidade_de_trabalho, TipoDaConta.CORRENTE)
    remunerada = _montar(unidade_de_trabalho, TipoDaConta.REMUNERADA)
    dividir = AceitarTransacaoImportadaDividida(unidade_de_trabalho)

    with pytest.raises(TransacaoImportadaInvalida):
        dividir.executar(USUARIO, remunerada.id, _partes())
    dividir.executar(USUARIO, corrente.id, _partes())

    assert len(_gastos(unidade_de_trabalho)) == 2
