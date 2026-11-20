from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.associar_movimento_ao_investimento import (
    AssociarMovimentoAoInvestimento,
)
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.destinacao import Destinacao, ParteDeDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import DestinacaoInvalida
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

USUARIO = uuid4()
DIA = date(2026, 10, 26)


def _cenario(uow, sentido=SentidoDaTransacao.ENTRADA, com_principal=False):
    conta = Conta(USUARIO, "Banco", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE, id_externo="c")
    transacao = TransacaoImportada(conta.id, "t1", DIA, "Vencimento CDB", Dinheiro(12000), sentido)
    with uow as u:
        u.contas.adicionar(conta)
        u.transacoes_importadas.adicionar_se_nova(transacao)
        u.investimentos.salvar_posicao(
            USUARIO, InvestimentoExterno("cdb", "CDB", "FIXED_INCOME", "CDB", Dinheiro(5000), "{}")
        )
        u.commit()
    with uow as u:
        cdb = u.investimentos.listar_posicoes(USUARIO)[0]
        if com_principal:
            aporte = MovimentoDeInvestimento(
                conta.id, TipoDeMovimento.APORTE, Dinheiro(10000), "Aporte", DIA, cdb.id
            )
            u.movimentos_de_investimento.adicionar(aporte)
            u.destinacoes.adicionar(aporte.id, [ParteDeDestinacao(Tag("casa"), Dinheiro(10000))])
            u.commit()
    return transacao, cdb


def _aceitar(uow, transacao, cdb, destinacoes=()):
    return AceitarTransacaoImportada(uow).executar(
        USUARIO,
        transacao.id,
        None,
        [],
        como_investimento=True,
        investimento_id=cdb.id,
        destinacoes=destinacoes,
    )


def test_resgate_em_posicao_sem_principal_aceita_lista_vazia_e_fica_sem_partes(
    unidade_de_trabalho,
):
    transacao, cdb = _cenario(unidade_de_trabalho)
    _aceitar(unidade_de_trabalho, transacao, cdb)
    with unidade_de_trabalho as u:
        (movimento,) = u.movimentos_de_investimento.listar(USUARIO, DIA, DIA)
        assert movimento.tipo == TipoDeMovimento.RESGATE
        assert movimento.investimento_id == cdb.id
        assert u.destinacoes.do_movimento([movimento.id]).get(movimento.id, []) == []


def test_resgate_em_posicao_com_principal_continua_exigindo_destinacoes(unidade_de_trabalho):
    transacao, cdb = _cenario(unidade_de_trabalho, com_principal=True)
    with pytest.raises(DestinacaoInvalida):
        _aceitar(unidade_de_trabalho, transacao, cdb)


def test_aporte_continua_exigindo_destinacoes(unidade_de_trabalho):
    transacao, cdb = _cenario(unidade_de_trabalho, sentido=SentidoDaTransacao.SAIDA)
    with pytest.raises(DestinacaoInvalida):
        _aceitar(unidade_de_trabalho, transacao, cdb)


def test_associar_resgate_sem_investimento_a_posicao_sem_principal_aceita_lista_vazia(
    unidade_de_trabalho,
):
    _, cdb = _cenario(unidade_de_trabalho)
    with unidade_de_trabalho as u:
        conta = u.contas.listar(USUARIO)[0]
        resgate = MovimentoDeInvestimento(
            conta.id, TipoDeMovimento.RESGATE, Dinheiro(5000), "Resgate", DIA
        )
        aporte = MovimentoDeInvestimento(
            conta.id, TipoDeMovimento.APORTE, Dinheiro(5000), "Aporte", DIA
        )
        u.movimentos_de_investimento.adicionar(resgate)
        u.movimentos_de_investimento.adicionar(aporte)
        u.commit()
    AssociarMovimentoAoInvestimento(unidade_de_trabalho).executar(USUARIO, resgate.id, cdb.id, [])
    with pytest.raises(DestinacaoInvalida):
        AssociarMovimentoAoInvestimento(unidade_de_trabalho).executar(
            USUARIO, aporte.id, cdb.id, []
        )
    with pytest.raises(DestinacaoInvalida):
        AssociarMovimentoAoInvestimento(unidade_de_trabalho).executar(
            USUARIO, aporte.id, cdb.id, [Destinacao(Tag("a"), 60)]
        )
