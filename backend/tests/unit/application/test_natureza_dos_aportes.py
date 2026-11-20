from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import TransacaoImportadaInvalida
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)

USUARIO = uuid4()
HOJE = date(2026, 11, 5)
DESTINO = [Destinacao(Tag.de_texto("patrimonio"), 100)]


def montar(unidade_de_trabalho, descricao, valor=95645):
    conta = Conta(USUARIO, "BTG", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE)
    acao = InvestimentoExterno(
        "aupo11",
        "AUPO11",
        "EQUITY",
        "ETF",
        Dinheiro(278925),
        "{}",
        valor_aplicado=Dinheiro(278925),
    )
    transacao = TransacaoImportada(
        conta.id, "t1", HOJE, descricao, Dinheiro(valor), SentidoDaTransacao.SAIDA
    )
    with unidade_de_trabalho as u:
        u.contas.adicionar(conta)
        u.investimentos.salvar_posicao(USUARIO, acao)
        u.transacoes_importadas.adicionar_se_nova(transacao)
        u.commit()
    with unidade_de_trabalho as u:
        investimento = u.investimentos.listar_posicoes(USUARIO)[0]
    return transacao, investimento


def aceitar(unidade_de_trabalho, transacao, **extra):
    return AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO, transacao.id, None, [], como_investimento=True, **extra
    )


def test_conta_remunerada_nao_vira_aporte_de_uma_acao(unidade_de_trabalho):
    transacao, acao = montar(unidade_de_trabalho, "CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA")
    with pytest.raises(TransacaoImportadaInvalida):
        aceitar(unidade_de_trabalho, transacao, investimento_id=acao.id, destinacoes=DESTINO)
    with unidade_de_trabalho as u:
        assert u.destinacoes.principais(USUARIO) == {}
        atual = u.transacoes_importadas.obter(USUARIO, transacao.id)
        assert atual.estado == EstadoDaTransacaoImportada.PENDENTE


def test_conta_remunerada_aceita_sem_investimento_nao_associa_depois_a_uma_acao(
    unidade_de_trabalho,
):
    transacao, acao = montar(unidade_de_trabalho, "CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA")
    with pytest.raises(TransacaoImportadaInvalida):
        aceitar(unidade_de_trabalho, transacao)


@pytest.mark.parametrize(
    "descricao",
    ["IRRF - CDB BANCO GUANABARA S/A 1", "LIQ BOLSA - VISTA TX EMOL", "LIQ BOLSA - VISTA TX CCP"],
)
def test_imposto_e_taxa_sem_posicao_nao_viram_aporte(unidade_de_trabalho, descricao):
    transacao, _ = montar(unidade_de_trabalho, descricao, valor=490)
    with pytest.raises(TransacaoImportadaInvalida):
        aceitar(unidade_de_trabalho, transacao)


def test_taxa_ligada_a_posicao_compoe_o_custo_dela(unidade_de_trabalho):
    transacao, acao = montar(unidade_de_trabalho, "LIQ BOLSA - VISTA TX EMOL", valor=62)
    # A 054 exige uma compra explícita, sem transformar a taxa em aporte.
    from gastoba.domain.destinacao import ParteDeDestinacao
    from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento

    compra = MovimentoDeInvestimento(
        transacao.conta_id,
        TipoDeMovimento.APORTE,
        Dinheiro(10000),
        "Compra fictícia",
        HOJE,
        investimento_id=acao.id,
    )
    with unidade_de_trabalho as u:
        u.movimentos_de_investimento.adicionar(compra)
        u.destinacoes.adicionar(compra.id, [ParteDeDestinacao(Tag("patrimonio"), Dinheiro(10000))])
        u.commit()
    taxa = aceitar(
        unidade_de_trabalho,
        transacao,
        investimento_id=acao.id,
        tipo_de_movimento=TipoDeMovimento.CUSTO,
        movimento_relacionado_id=compra.id,
    )
    assert taxa.tipo == TipoDeMovimento.CUSTO
    with unidade_de_trabalho as u:
        assert u.destinacoes.principais(USUARIO)[acao.id][Tag("patrimonio")] == Dinheiro(10062)


def test_conta_remunerada_so_liga_a_caixinha(unidade_de_trabalho):
    transacao, _ = montar(unidade_de_trabalho, "CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA")
    caixinha = InvestimentoExterno(
        "identidade-estavel",
        "Conta remunerada",
        "CAIXINHA",
        None,
        Dinheiro(96217),
        "{}",
        conta_remunerada_id=transacao.conta_id,
    )
    with unidade_de_trabalho as u:
        u.investimentos.salvar_posicao(USUARIO, caixinha)
        u.commit()
        alvo = next(p for p in u.investimentos.listar_posicoes(USUARIO) if p.tipo == "CAIXINHA")
    aceitar(unidade_de_trabalho, transacao, investimento_id=alvo.id, destinacoes=DESTINO)
    with unidade_de_trabalho as u:
        assert u.destinacoes.principais(USUARIO)[alvo.id][Tag.de_texto("patrimonio")] == Dinheiro(
            95645
        )


@pytest.mark.parametrize(
    ("descricao", "sentido", "categoria"),
    [
        ("CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA", SentidoDaTransacao.SAIDA, "lazer"),
        ("CONTA REMUNERADA - RESGATE AUTOMÁTICO", SentidoDaTransacao.ENTRADA, None),
        ("RENDIMENTO CONTA REMUNERADA", SentidoDaTransacao.ENTRADA, None),
    ],
)
def test_conta_remunerada_e_rendimento_nao_viram_gasto_nem_ganho(
    unidade_de_trabalho, descricao, sentido, categoria
):
    from gastoba.domain.categoria import CategoriaDoGasto

    conta = Conta(USUARIO, "BTG", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE, id_externo="c")
    transacao = TransacaoImportada(conta.id, "x", HOJE, descricao, Dinheiro(1000), sentido)
    with unidade_de_trabalho as u:
        u.contas.adicionar(conta)
        u.transacoes_importadas.adicionar_se_nova(transacao)
        u.commit()

    with pytest.raises(TransacaoImportadaInvalida):
        AceitarTransacaoImportada(unidade_de_trabalho).executar(
            USUARIO, transacao.id, CategoriaDoGasto(categoria) if categoria else None, []
        )
