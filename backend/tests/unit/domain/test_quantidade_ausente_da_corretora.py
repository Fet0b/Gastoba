from datetime import date
from decimal import Decimal
from uuid import uuid4

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.operacao_da_corretora import (
    converter_operacao_externa,
    inferir_quantidade_faltante,
)
from gastoba.domain.portas import OperacaoExterna


def _externa(quantidade, tipo="BUY"):
    return OperacaoExterna(
        id_externo="b1",
        tipo=tipo,
        data=date(2026, 10, 21),
        quantidade=quantidade,
        valor_bruto=Dinheiro(45528),
        sentido="CREDIT",
    )


def _operacao(tipo, quantidade, estimada=False, valor=45528, id_externo="x"):
    return Operacao(
        posicao_id=uuid4(),
        tipo=tipo,
        data=date(2026, 10, 21),
        quantidade=Decimal(quantidade),
        valor_bruto=Dinheiro(valor),
        origem=OrigemDaOperacao.PLUGGY,
        id_externo=id_externo,
        quantidade_estimada=estimada,
    )


def test_compra_sem_quantidade_vira_operacao_estimada_e_nao_compra_de_zero_cotas():
    operacao = converter_operacao_externa(_externa(None), uuid4(), "EQUITY", False)
    assert operacao is not None
    assert operacao.tipo == TipoDeOperacao.COMPRA
    assert operacao.quantidade == Decimal(0) and operacao.quantidade_estimada


def test_compra_com_quantidade_continua_confirmada():
    operacao = converter_operacao_externa(_externa("3"), uuid4(), "EQUITY", False)
    assert operacao is not None and not operacao.quantidade_estimada


def test_renda_fixa_nao_depende_da_quantidade_da_corretora():
    operacao = converter_operacao_externa(_externa(None), uuid4(), "FIXED_INCOME", False)
    assert operacao is not None and not operacao.quantidade_estimada
    assert operacao.quantidade == Decimal(1)


def test_infere_a_quantidade_da_unica_operacao_sem_quantidade():
    sem = _operacao(TipoDeOperacao.COMPRA, "0", estimada=True, id_externo="a")
    outra = _operacao(TipoDeOperacao.COMPRA, "2", id_externo="b")
    venda = _operacao(TipoDeOperacao.VENDA, "1", id_externo="c")
    inferida = inferir_quantidade_faltante([sem, outra, venda], Decimal("6"))
    assert inferida is not None and inferida.id == sem.id
    assert inferida.quantidade == Decimal("5") and inferida.quantidade_estimada


def test_nao_infere_com_mais_de_uma_incerta_sem_observada_ou_resultado_nao_positivo():
    a = _operacao(TipoDeOperacao.COMPRA, "0", estimada=True, id_externo="a")
    b = _operacao(TipoDeOperacao.COMPRA, "0", estimada=True, id_externo="b")
    assert inferir_quantidade_faltante([a, b], Decimal("3")) is None
    assert inferir_quantidade_faltante([a], None) is None
    assert inferir_quantidade_faltante([a], Decimal("0")) is None
    assert (
        inferir_quantidade_faltante([_operacao(TipoDeOperacao.COMPRA, "2")], Decimal("3")) is None
    )
