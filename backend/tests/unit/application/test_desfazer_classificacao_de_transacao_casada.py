"""Transação ligada a uma operação (Revisão da bolsa) não se reclassifica por outra rota."""

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.desfazer_classificacao_importada import (
    DesfazerClassificacaoImportada,
    desfazer_sem_confirmar,
)
from gastoba.application.reclassificar_transacao_importada import (
    ReclassificarTransacaoImportada,
)
from gastoba.domain.casamento_de_operacao import (
    CasamentoDeOperacao,
    PapelDoVinculo,
    VinculoDeCasamento,
)
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import TransacaoCasada
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)

PESSOA = uuid4()


def _cenario(uow):
    conta = Conta(PESSOA, "Banco", Dinheiro(50000), origem=OrigemDaConta.OPEN_FINANCE)
    transacao = TransacaoImportada(
        conta.id,
        "x1",
        date(2026, 11, 4),
        "LIQ BOLSA - VISTA BRUTO - PREGÃO: 03/11/2026",
        Dinheiro(3200),
        SentidoDaTransacao.SAIDA,
    )
    with uow as u:
        u.contas.adicionar(conta)
        u.transacoes_importadas.adicionar_se_nova(transacao)
        u.investimentos.salvar_posicao(
            PESSOA, InvestimentoExterno("a", "AUPO11", "EQUITY", None, Dinheiro(1), "{}")
        )
        u.commit()
    with uow as u:
        (posicao,) = u.investimentos.listar_posicoes(PESSOA)
    AceitarTransacaoImportada(uow).executar(PESSOA, transacao.id, None, [], como_investimento=True)
    operacao = Operacao(
        posicao_id=posicao.id,
        tipo=TipoDeOperacao.COMPRA,
        data=date(2026, 11, 3),
        quantidade=Decimal("1"),
        valor_bruto=Dinheiro(3200),
        origem=OrigemDaOperacao.PLUGGY,
        id_externo="op-1",
    )
    with uow as u:
        u.operacoes.adicionar(PESSOA, operacao)
        u.casamentos.adicionar(
            PESSOA,
            CasamentoDeOperacao(
                (operacao.id,), (VinculoDeCasamento(transacao.id, PapelDoVinculo.BRUTO),)
            ),
        )
        u.commit()
    return transacao, conta


def test_desfazer_classificacao_recusa_transacao_casada_e_nada_muda(unidade_de_trabalho):
    transacao, conta = _cenario(unidade_de_trabalho)
    antes = unidade_de_trabalho.confirmado
    movimentos = len(antes.movimentos_de_investimento)
    with pytest.raises(TransacaoCasada):
        DesfazerClassificacaoImportada(unidade_de_trabalho).executar(PESSOA, transacao.id)
    depois = unidade_de_trabalho.confirmado
    assert depois.transacoes_importadas[transacao.id].estado == EstadoDaTransacaoImportada.ACEITA
    assert len(depois.movimentos_de_investimento) == movimentos
    assert depois.contas[conta.id].saldo == Dinheiro(50000)
    assert not depois.reversoes_de_classificacao


def test_desfazer_sem_confirmar_recusa_transacao_casada(unidade_de_trabalho):
    transacao, _ = _cenario(unidade_de_trabalho)
    with unidade_de_trabalho as uow, pytest.raises(TransacaoCasada):
        desfazer_sem_confirmar(uow, PESSOA, transacao.id, confirmar=False)


def test_reclassificar_recusa_transacao_casada(unidade_de_trabalho):
    transacao, _ = _cenario(unidade_de_trabalho)
    with pytest.raises(TransacaoCasada):
        ReclassificarTransacaoImportada(unidade_de_trabalho).executar(
            PESSOA, transacao.id, "gasto", versao_esperada="qualquer"
        )
    assert (
        unidade_de_trabalho.confirmado.transacoes_importadas[transacao.id].estado
        == EstadoDaTransacaoImportada.ACEITA
    )
