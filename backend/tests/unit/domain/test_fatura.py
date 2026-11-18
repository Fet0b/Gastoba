from datetime import date
from uuid import uuid4

import pytest

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ValorInvalido
from gastoba.domain.fatura import (
    Fatura,
    FonteDaFatura,
    PagamentoDeFatura,
    SituacaoDaFatura,
)


def _fatura(total="100.00", pagamentos=(), vencimento=date(2026, 11, 22)):
    return Fatura(
        id=uuid4(),
        conta_id=uuid4(),
        id_externo=None,
        inicio=date(2026, 10, 16),
        fechamento=date(2026, 11, 15),
        vencimento=vencimento,
        total=Dinheiro.de_reais(total),
        minimo=None,
        pagamentos=tuple(pagamentos),
        fonte=FonteDaFatura.ESTIMADA,
    )


def _pagamento(valor):
    return PagamentoDeFatura(data=date(2026, 11, 20), valor=Dinheiro.de_reais(valor), forma=None)


def test_pagamento_exige_valor_positivo():
    with pytest.raises(ValorInvalido):
        PagamentoDeFatura(data=date(2026, 11, 1), valor=Dinheiro(0), forma=None)


def test_total_nao_pode_ser_negativo():
    with pytest.raises(ValorInvalido):
        _fatura(total="-1.00")


def test_pago_restante_e_a_favor():
    fatura = _fatura(pagamentos=[_pagamento("30.00"), _pagamento("20.00")])
    assert fatura.pago == Dinheiro.de_reais("50.00")
    assert fatura.restante == Dinheiro.de_reais("50.00")
    assert fatura.a_favor == Dinheiro(0)


def test_pago_a_maior_gera_a_favor_e_restante_zero():
    fatura = _fatura(pagamentos=[_pagamento("120.00")])
    assert fatura.restante == Dinheiro(0)
    assert fatura.a_favor == Dinheiro.de_reais("20.00")


def test_total_zero_sem_pagamento_tem_restante_zero():
    fatura = _fatura(total="0.00")
    assert fatura.restante == Dinheiro(0)
    assert fatura.situacao(date(2026, 11, 16)) is SituacaoDaFatura.PAGA


def test_no_dia_do_fechamento_ainda_e_aberta():
    assert _fatura().situacao(date(2026, 11, 15)) is SituacaoDaFatura.ABERTA
    assert _fatura().situacao(date(2026, 11, 1)) is SituacaoDaFatura.ABERTA


def test_depois_do_fechamento_e_fechada_ate_o_vencimento_inclusive():
    assert _fatura().situacao(date(2026, 11, 16)) is SituacaoDaFatura.FECHADA
    assert _fatura().situacao(date(2026, 11, 22)) is SituacaoDaFatura.FECHADA


def test_depois_do_vencimento_sem_pagar_e_vencida():
    assert _fatura().situacao(date(2026, 11, 23)) is SituacaoDaFatura.VENCIDA


def test_vencimento_nulo_nunca_e_vencida():
    assert _fatura(vencimento=None).situacao(date(2027, 5, 1)) is SituacaoDaFatura.FECHADA


def test_paga_quando_o_restante_e_zero_depois_do_fechamento():
    fatura = _fatura(pagamentos=[_pagamento("100.00")])
    assert fatura.situacao(date(2026, 11, 30)) is SituacaoDaFatura.PAGA
