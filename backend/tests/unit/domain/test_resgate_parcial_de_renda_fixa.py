from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.operacao_da_corretora import converter_operacao_externa
from gastoba.domain.portas import OperacaoExterna


def venda(valor=2500):
    return OperacaoExterna(
        "venda", "SELL", date(2026, 10, 26), "0", Dinheiro(valor), sentido="DEBIT"
    )


def test_fracao_da_venda_parcial_pelo_saldo_anterior():
    operacao = converter_operacao_externa(
        venda(), uuid4(), "FIXED_INCOME", False, saldo_anterior=Dinheiro(10000)
    )
    assert operacao.quantidade == Decimal("0.25")
    assert operacao.valor_bruto == Dinheiro(2500)


@pytest.mark.parametrize("saldo", [None, Dinheiro(0), Dinheiro(-1), Dinheiro(2000)])
def test_sem_saldo_anterior_valido_mantem_pendencia(saldo):
    assert (
        converter_operacao_externa(venda(), uuid4(), "FIXED_INCOME", False, saldo_anterior=saldo)
        is None
    )


def test_resgate_total_continua_quantidade_um():
    assert converter_operacao_externa(venda(), uuid4(), "FIXED_INCOME", True).quantidade == Decimal(
        1
    )


def test_fracao_periodica_nao_usa_float():
    operacao = converter_operacao_externa(
        venda(100), uuid4(), "FIXED_INCOME", False, saldo_anterior=Dinheiro(300)
    )
    assert isinstance(operacao.quantidade, Decimal)
    assert abs(operacao.quantidade * 3 - 1) < Decimal("1e-26")
