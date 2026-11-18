from datetime import date
from uuid import uuid4

import pytest

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.investimento import Investimento, valor_sem_destinacao
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    OrigemDoMovimento,
    TipoDeMovimento,
)
from gastoba.domain.tag import Tag

DIA = date(2026, 10, 22)


def posicao(saldo=41001, valor_aplicado=None):
    return Investimento(
        id=uuid4(),
        id_externo="lci",
        nome="LCI BTG",
        tipo="FIXED_INCOME",
        subtipo="LCI",
        saldo=Dinheiro(saldo),
        valor_aplicado=None if valor_aplicado is None else Dinheiro(valor_aplicado),
    )


def principais(**centavos):
    return {Tag.de_texto(t): Dinheiro(c) for t, c in centavos.items()}


def test_saldo_inicial_e_um_aporte_sem_conta_ja_associado_ao_investimento():
    investimento_id = uuid4()

    m = MovimentoDeInvestimento.de_saldo_inicial(investimento_id, Dinheiro(30000), DIA)

    assert m.conta_id is None
    assert m.investimento_id == investimento_id
    assert m.tipo == TipoDeMovimento.APORTE
    assert m.origem == OrigemDoMovimento.SALDO_INICIAL
    assert m.descricao == "Saldo inicial"
    assert (m.valor, m.data) == (Dinheiro(30000), DIA)


def test_so_o_saldo_inicial_pode_ficar_sem_conta():
    with pytest.raises(ValueError):
        MovimentoDeInvestimento(None, TipoDeMovimento.APORTE, Dinheiro(1), "LCI", DIA)
    with pytest.raises(ValueError):
        MovimentoDeInvestimento(
            uuid4(),
            TipoDeMovimento.APORTE,
            Dinheiro(1),
            "Saldo inicial",
            DIA,
            investimento_id=uuid4(),
            origem=OrigemDoMovimento.SALDO_INICIAL,
        )


def test_saldo_inicial_precisa_ser_aporte_com_investimento():
    with pytest.raises(ValueError):
        MovimentoDeInvestimento(
            None,
            TipoDeMovimento.RESGATE,
            Dinheiro(1),
            "Saldo inicial",
            DIA,
            investimento_id=uuid4(),
            origem=OrigemDoMovimento.SALDO_INICIAL,
        )
    with pytest.raises(ValueError):
        MovimentoDeInvestimento(
            None,
            TipoDeMovimento.APORTE,
            Dinheiro(1),
            "Saldo inicial",
            DIA,
            origem=OrigemDoMovimento.SALDO_INICIAL,
        )


def test_a_base_e_o_valor_aplicado_menos_o_principal_ja_registrado():
    investimento = posicao(saldo=41001, valor_aplicado=40000)

    assert valor_sem_destinacao(investimento, {}) == Dinheiro(40000)
    assert valor_sem_destinacao(investimento, principais(casa=10000, viagem=5000)) == Dinheiro(
        25000
    )


def test_sem_valor_aplicado_a_base_e_o_saldo():
    investimento = posicao(saldo=41001)

    assert valor_sem_destinacao(investimento, principais(casa=1001)) == Dinheiro(40000)


@pytest.mark.parametrize("principal", [40000, 40001])
def test_nada_a_destinar_quando_o_principal_cobre_a_base(principal):
    investimento = posicao(saldo=41001, valor_aplicado=40000)

    assert valor_sem_destinacao(investimento, principais(casa=principal)) == Dinheiro(0)
