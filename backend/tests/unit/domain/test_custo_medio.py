from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from gastoba.domain.custo_medio import calcular_posicao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import OperacaoInvalida
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao

POSICAO = uuid4()


def _op(tipo, dia, quantidade, bruto, custos=0, origem=OrigemDaOperacao.MANUAL):
    return Operacao(
        posicao_id=POSICAO,
        tipo=tipo,
        data=date(2026, 11, dia),
        quantidade=Decimal(quantidade),
        valor_bruto=Dinheiro(bruto),
        custos=Dinheiro(custos),
        origem=origem,
        operacao_relacionada_id=uuid4()
        if tipo in (TipoDeOperacao.TAXA, TipoDeOperacao.IMPOSTO)
        else None,
    )


def test_sem_operacoes_a_posicao_e_vazia():
    posicao = calcular_posicao([])
    assert posicao.quantidade == Decimal("0")
    assert posicao.valor_aplicado == Dinheiro(0)
    assert posicao.custo_medio is None
    assert posicao.resultado_realizado == Dinheiro(0)


def test_aupo11_compra_de_25_cotas():
    posicao = calcular_posicao([_op(TipoDeOperacao.COMPRA, 3, "25", 278930)])
    assert posicao.quantidade == Decimal("25")
    assert posicao.valor_aplicado == Dinheiro(278930)
    assert posicao.custo_medio == Decimal("111.572")


def test_custos_entram_no_custo_da_compra():
    # IN RFB 1.585/2015, art. 58: corretagem e emolumentos somam ao custo.
    posicao = calcular_posicao([_op(TipoDeOperacao.COMPRA, 3, "25", 278930, custos=82)])
    assert posicao.valor_aplicado == Dinheiro(279012)


def test_custo_medio_ponderado_de_duas_compras():
    posicao = calcular_posicao(
        [
            _op(TipoDeOperacao.COMPRA, 3, "10", 10000),
            _op(TipoDeOperacao.COMPRA, 5, "10", 12000),
        ]
    )
    assert posicao.quantidade == Decimal("20")
    assert posicao.valor_aplicado == Dinheiro(22000)
    assert posicao.custo_medio == Decimal("11")


def test_venda_parcial_abate_pelo_custo_medio_e_realiza_resultado():
    posicao = calcular_posicao(
        [
            _op(TipoDeOperacao.COMPRA, 3, "10", 10000),
            _op(TipoDeOperacao.VENDA, 6, "4", 6000, custos=100),
        ]
    )
    assert posicao.quantidade == Decimal("6")
    assert posicao.valor_aplicado == Dinheiro(6000)
    # receita liquida 5900 - custo baixado 4000
    assert posicao.resultado_realizado == Dinheiro(1900)


def test_venda_total_zera_sem_dividir_por_zero():
    posicao = calcular_posicao(
        [
            _op(TipoDeOperacao.COMPRA, 3, "10", 10000),
            _op(TipoDeOperacao.VENDA, 6, "10", 9000),
        ]
    )
    assert posicao.quantidade == Decimal("0")
    assert posicao.valor_aplicado == Dinheiro(0)
    assert posicao.custo_medio is None
    assert posicao.resultado_realizado == Dinheiro(-1000)


def test_venda_maior_que_a_quantidade_e_recusada():
    with pytest.raises(OperacaoInvalida):
        calcular_posicao(
            [
                _op(TipoDeOperacao.COMPRA, 3, "10", 10000),
                _op(TipoDeOperacao.VENDA, 6, "11", 9000),
            ]
        )


def test_ordem_das_operacoes_e_por_data_nao_por_lista():
    posicao = calcular_posicao(
        [
            _op(TipoDeOperacao.VENDA, 6, "4", 6000),
            _op(TipoDeOperacao.COMPRA, 3, "10", 10000),
        ]
    )
    assert posicao.quantidade == Decimal("6")


def test_abertura_entra_como_compra_com_o_custo_informado():
    posicao = calcular_posicao(
        [_op(TipoDeOperacao.ABERTURA, 1, "25", 278925, origem=OrigemDaOperacao.ABERTURA)]
    )
    assert posicao.quantidade == Decimal("25")
    assert posicao.valor_aplicado == Dinheiro(278925)


def test_provento_nao_altera_quantidade_nem_custo():
    posicao = calcular_posicao(
        [
            _op(TipoDeOperacao.COMPRA, 3, "10", 10000),
            _op(TipoDeOperacao.PROVENTO, 9, "0", 500),
        ]
    )
    assert posicao.quantidade == Decimal("10")
    assert posicao.valor_aplicado == Dinheiro(10000)
    assert posicao.proventos == Dinheiro(500)


def test_resultado_nao_realizado_usa_o_valor_de_mercado():
    posicao = calcular_posicao([_op(TipoDeOperacao.COMPRA, 3, "25", 278930)])
    assert posicao.resultado_nao_realizado(Dinheiro(369237)) == Dinheiro(90307)


def test_arredondamento_so_em_centavos_inteiros():
    posicao = calcular_posicao(
        [
            _op(TipoDeOperacao.COMPRA, 3, "3", 10000),
            _op(TipoDeOperacao.VENDA, 6, "1", 4000),
        ]
    )
    # custo baixado = 10000/3 = 3333,33... centavos; resta 6666,67 -> 6667
    assert posicao.valor_aplicado == Dinheiro(6667)
    assert posicao.resultado_realizado == Dinheiro(667)


def test_vencimento_de_renda_fixa_realiza_o_resultado():
    posicao = calcular_posicao(
        [
            _op(TipoDeOperacao.COMPRA, 3, "1", 100000),
            _op(TipoDeOperacao.VENCIMENTO, 20, "1", 112000),
        ]
    )
    assert posicao.quantidade == Decimal("0")
    assert posicao.resultado_realizado == Dinheiro(12000)
