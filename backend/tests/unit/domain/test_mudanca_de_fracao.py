from datetime import date
from uuid import uuid4

import pytest

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import DestinacaoInvalida, PrincipalInsuficiente
from gastoba.domain.mudanca_de_fracao import (
    MotivoDaMudancaDeFracao,
    MudancaDeFracao,
    mover_fracao,
)
from gastoba.domain.tag import Tag

POSICAO = uuid4()
RESERVA, CELULAR = Tag("reserva"), Tag("celular")
DIA = date(2026, 11, 10)


def test_mudanca_com_origem_e_realocacao_e_sem_origem_e_alocacao():
    realocacao = MudancaDeFracao(POSICAO, DIA, CELULAR, Dinheiro(15000), origem=RESERVA)
    alocacao = MudancaDeFracao(POSICAO, DIA, CELULAR, Dinheiro(15000))
    assert realocacao.motivo is MotivoDaMudancaDeFracao.REALOCACAO
    assert alocacao.motivo is MotivoDaMudancaDeFracao.ALOCACAO
    assert realocacao.id != alocacao.id


@pytest.mark.parametrize("centavos", [0, -1])
def test_valor_precisa_ser_positivo(centavos):
    with pytest.raises(DestinacaoInvalida):
        MudancaDeFracao(POSICAO, DIA, CELULAR, Dinheiro(centavos), origem=RESERVA)


def test_origem_precisa_ser_diferente_do_destino():
    with pytest.raises(DestinacaoInvalida):
        MudancaDeFracao(POSICAO, DIA, CELULAR, Dinheiro(100), origem=CELULAR)


def test_mover_fracao_tira_da_origem_e_poe_no_destino_sem_mudar_a_soma():
    a, b, c = uuid4(), uuid4(), uuid4()
    pesos = {a: 60000, b: 40000}
    novos = mover_fracao(pesos, a, c, 15000)
    assert novos == {a: 45000, b: 40000, c: 15000}
    assert sum(novos.values()) == sum(pesos.values())
    assert pesos == {a: 60000, b: 40000}  # não muta a entrada


def test_mover_toda_a_fracao_tira_a_origem_dos_pesos():
    a, b = uuid4(), uuid4()
    assert mover_fracao({a: 100, b: 50}, a, b, 100) == {b: 150}


def test_mover_mais_que_a_fracao_da_origem_e_recusado():
    a, b = uuid4(), uuid4()
    with pytest.raises(PrincipalInsuficiente):
        mover_fracao({a: 100}, a, b, 101)
    with pytest.raises(PrincipalInsuficiente):
        mover_fracao({a: 100}, b, a, 1)  # origem sem fração


@pytest.mark.parametrize("centavos", [0, -5])
def test_mover_valor_nao_positivo_e_recusado(centavos):
    a, b = uuid4(), uuid4()
    with pytest.raises(DestinacaoInvalida):
        mover_fracao({a: 100}, a, b, centavos)


def test_mover_para_a_propria_origem_e_recusado():
    a = uuid4()
    with pytest.raises(DestinacaoInvalida):
        mover_fracao({a: 100}, a, a, 10)
