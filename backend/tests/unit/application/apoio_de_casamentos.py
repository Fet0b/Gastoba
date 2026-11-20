"""Ajudas de teste para montar uma operação da corretora com transações ligadas a ela."""

from datetime import date
from decimal import Decimal
from uuid import uuid4

from gastoba.domain.casamento_de_liquidacao import Tolerancia, montar_casamento_de_bolsa
from gastoba.domain.casamento_de_resgate_de_renda_fixa import (
    e_imposto,
    montar_casamento_de_renda_fixa,
)
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

USUARIO, OUTRO = uuid4(), uuid4()
BRUTO = "LIQ BOLSA - VISTA BRUTO - PREGÃO: 03/11/2026 - EXEC.: 85 - S 46780"
TAXA = "LIQ BOLSA - VISTA TX CCP/EMOL/TTA B3"


def _cenario(uow, tipo="EQUITY", operacao_tipo=TipoDeOperacao.COMPRA, bruto=278930, custos=0):
    conta = Conta(USUARIO, "Banco", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE, id_externo="c")
    with uow as u:
        u.contas.adicionar(conta)
        u.investimentos.salvar_posicao(
            USUARIO, InvestimentoExterno("a", "ATIVO", tipo, None, Dinheiro(100000), "{}")
        )
        u.commit()
    with uow as u:
        investimento = u.investimentos.listar_posicoes(USUARIO)[0]
        operacao = Operacao(
            posicao_id=investimento.id,
            tipo=operacao_tipo,
            data=date(2026, 11, 3),
            quantidade=Decimal("1"),
            valor_bruto=Dinheiro(bruto),
            custos=Dinheiro(custos),
            origem=OrigemDaOperacao.PLUGGY,
            id_externo="op1",
        )
        u.operacoes.adicionar(USUARIO, operacao)
        u.commit()
    return conta, operacao


def _transacao(uow, conta, descricao, centavos, dia=5, sentido=SentidoDaTransacao.SAIDA):
    t = TransacaoImportada(
        conta.id, f"x{uuid4()}", date(2026, 11, dia), descricao, Dinheiro(centavos), sentido
    )
    with uow as u:
        u.transacoes_importadas.adicionar_se_nova(t)
        u.commit()
    return t


def ligar(uow, operacao, transacoes, renda_fixa=False):
    """Grava o casamento da operação com as transações e as aceita, como a ligação faz (sem o
    aporte): serve aos testes que só precisam da ligação existir."""
    tolerancia = Tolerancia()
    if renda_fixa:
        impostos = [t for t in transacoes if e_imposto(t)]
        creditos = [t for t in transacoes if t not in impostos]
        casamento = montar_casamento_de_renda_fixa(
            operacao, creditos, impostos[0] if impostos else None, tolerancia
        )
    else:
        casamento = montar_casamento_de_bolsa([operacao], transacoes, tolerancia)
    with uow as u:
        u.casamentos.adicionar(USUARIO, casamento)
        for transacao in transacoes:
            transacao.aceitar()
            u.transacoes_importadas.atualizar_estado(transacao)
        u.commit()
    return casamento
