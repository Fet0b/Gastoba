from datetime import date
from uuid import uuid4

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.fatura import (
    CompraDoCartao,
    Fatura,
    FonteDaFatura,
    PagamentoDeFatura,
    atribuir_ciclo,
    estimar_faturas,
)
from gastoba.domain.transacao_importada import SentidoDaTransacao


def _compra(data, valor, sentido=SentidoDaTransacao.SAIDA, id_da_fatura=None):
    return CompraDoCartao(
        id=uuid4(),
        data=data,
        valor=Dinheiro.de_reais(valor),
        sentido=sentido,
        id_da_fatura=id_da_fatura,
    )


def _estimar(
    compras, hoje, pagamentos=(), fechamento=date(2026, 11, 15), vencimento=date(2026, 11, 22)
):
    return estimar_faturas(fechamento, vencimento, compras, pagamentos, hoje)


def test_agrupa_compras_por_ciclo_mensal():
    compras = [
        _compra(date(2026, 10, 10), "50.00"),
        _compra(date(2026, 10, 16), "4.13"),
        _compra(date(2026, 11, 3), "118.05"),
    ]
    faturas = _estimar(compras, hoje=date(2026, 11, 5))
    assert [f.fechamento for f in faturas] == [date(2026, 10, 15), date(2026, 11, 15)]
    assert faturas[0].total == Dinheiro.de_reais("50.00")
    assert faturas[1].total == Dinheiro.de_reais("122.18")
    assert faturas[1].inicio == date(2026, 10, 16)
    assert faturas[1].vencimento == date(2026, 11, 22)
    assert faturas[0].vencimento == date(2026, 10, 22)


def test_compra_no_dia_do_fechamento_fica_naquele_ciclo():
    faturas = _estimar([_compra(date(2026, 10, 15), "10.00")], hoje=date(2026, 10, 20))
    assert faturas[0].fechamento == date(2026, 10, 15)
    assert faturas[0].total == Dinheiro.de_reais("10.00")


def test_estorno_subtrai_e_o_total_nao_fica_negativo():
    compras = [
        _compra(date(2026, 11, 1), "10.00"),
        _compra(date(2026, 11, 2), "30.00", SentidoDaTransacao.ENTRADA),
    ]
    faturas = _estimar(compras, hoje=date(2026, 11, 5))
    assert faturas[-1].total == Dinheiro(0)


def test_sem_compras_devolve_so_o_ciclo_de_hoje():
    faturas = _estimar([], hoje=date(2026, 11, 5))
    assert [f.fechamento for f in faturas] == [date(2026, 11, 15)]
    assert faturas[0].total == Dinheiro(0)


def test_ciclo_sem_compras_no_meio_aparece_com_total_zero():
    compras = [_compra(date(2026, 8, 20), "10.00")]
    faturas = _estimar(compras, hoje=date(2026, 11, 5))
    assert [f.fechamento for f in faturas] == [
        date(2026, 9, 15),
        date(2026, 10, 15),
        date(2026, 11, 15),
    ]
    assert faturas[1].total == Dinheiro(0)


def test_fechamento_dia_31_em_mes_curto_vira_o_ultimo_dia():
    faturas = estimar_faturas(
        date(2026, 1, 31),
        date(2026, 2, 7),
        [_compra(date(2026, 2, 10), "5.00")],
        [],
        hoje=date(2026, 3, 10),
    )
    assert [f.fechamento for f in faturas] == [date(2026, 2, 28), date(2026, 3, 31)]
    assert faturas[0].inicio == date(2026, 2, 1)
    assert faturas[1].inicio == date(2026, 3, 1)


def test_pagamento_vai_para_a_fatura_de_maior_fechamento_anterior_a_data():
    compras = [_compra(date(2026, 10, 10), "50.00"), _compra(date(2026, 11, 3), "20.00")]
    pagamento = PagamentoDeFatura(date(2026, 10, 25), Dinheiro.de_reais("50.00"), None)
    faturas = _estimar(compras, hoje=date(2026, 11, 5), pagamentos=[pagamento])
    assert faturas[0].pagamentos == (pagamento,)
    assert faturas[1].pagamentos == ()


def _fatura(inicio, fechamento, id_externo=None):
    return Fatura(
        id=uuid4(),
        conta_id=uuid4(),
        id_externo=id_externo,
        inicio=inicio,
        fechamento=fechamento,
        vencimento=None,
        total=Dinheiro(0),
        minimo=None,
        pagamentos=(),
        fonte=FonteDaFatura.ESTIMADA,
    )


def test_bill_id_vence_a_janela_de_datas():
    a = _fatura(date(2026, 9, 16), date(2026, 10, 15), "bill-a")
    b = _fatura(date(2026, 10, 16), date(2026, 11, 15), "bill-b")
    compra = _compra(date(2026, 10, 20), "1.00", id_da_fatura="bill-a")
    assert atribuir_ciclo(compra, [a, b]) == a.id


def test_sem_bill_id_usa_a_janela_de_datas():
    a = _fatura(date(2026, 9, 16), date(2026, 10, 15))
    b = _fatura(date(2026, 10, 16), date(2026, 11, 15))
    assert atribuir_ciclo(_compra(date(2026, 10, 15), "1.00"), [a, b]) == a.id
    assert atribuir_ciclo(_compra(date(2026, 10, 16), "1.00"), [a, b]) == b.id


def test_compra_fora_de_qualquer_ciclo_fica_sem_fatura():
    a = _fatura(date(2026, 9, 16), date(2026, 10, 15))
    assert atribuir_ciclo(_compra(date(2026, 9, 1), "1.00"), [a]) is None
    assert atribuir_ciclo(_compra(date(2026, 12, 1), "1.00"), [a]) is None
    assert atribuir_ciclo(_compra(date(2026, 9, 20), "1.00", id_da_fatura="outra"), [a]) == a.id
