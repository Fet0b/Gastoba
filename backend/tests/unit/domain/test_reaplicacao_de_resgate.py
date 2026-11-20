from dataclasses import replace
from datetime import date, timedelta
from uuid import uuid4

import pytest

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ReaplicacaoInvalida
from gastoba.domain.investimento import Investimento
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    OrigemDoMovimento,
    TipoDeMovimento,
)
from gastoba.domain.reaplicacao_de_resgate import ReaplicacaoDeResgate, validar_reaplicacao


@pytest.fixture
def cenario():
    origem = Investimento(uuid4(), "origem", "Origem", "FIXED_INCOME", None, Dinheiro(0))
    destino = replace(origem, id=uuid4(), id_externo="destino")
    resgate = MovimentoDeInvestimento(
        uuid4(), TipoDeMovimento.RESGATE, Dinheiro(10000), "Resgate", date(2026, 10, 31), origem.id
    )
    aporte = MovimentoDeInvestimento(
        resgate.conta_id,
        TipoDeMovimento.APORTE,
        Dinheiro(15000),
        "Aporte",
        date(2026, 11, 1),
        destino.id,
    )
    return resgate, aporte, origem, destino


@pytest.mark.parametrize("valor", [1, 5000, 10000])
def test_aceita_parcial_e_total_com_posicoes_encerradas(cenario, valor):
    validar_reaplicacao(*cenario, Dinheiro(valor))


@pytest.mark.parametrize("valor", [0, -1, 10001, 15001])
def test_rejeita_valor_fora_da_capacidade(cenario, valor):
    with pytest.raises(ReaplicacaoInvalida):
        validar_reaplicacao(*cenario, Dinheiro(valor))


def test_limite_do_aporte_e_independente_do_resgate(cenario):
    resgate, aporte, origem, destino = cenario
    aporte = replace(aporte, valor=Dinheiro(4000))
    with pytest.raises(ReaplicacaoInvalida):
        validar_reaplicacao(resgate, aporte, origem, destino, Dinheiro(4001))
    validar_reaplicacao(resgate, aporte, origem, destino, Dinheiro(4000))


def test_coberturas_consumem_capacidade_global(cenario):
    validar_reaplicacao(*cenario, Dinheiro(6000), coberto=Dinheiro(4000))
    with pytest.raises(ReaplicacaoInvalida):
        validar_reaplicacao(*cenario, Dinheiro(6001), coberto=Dinheiro(4000))


@pytest.mark.parametrize("ponta", [0, 1])
def test_rejeita_tipo_incorreto(cenario, ponta):
    partes = list(cenario)
    partes[ponta] = replace(
        partes[ponta], tipo=TipoDeMovimento.APORTE if ponta == 0 else TipoDeMovimento.RESGATE
    )
    with pytest.raises(ReaplicacaoInvalida):
        validar_reaplicacao(*partes, Dinheiro(1))


@pytest.mark.parametrize("ponta", [2, 3])
def test_rejeita_caixinha_e_posicao_ausente(cenario, ponta):
    for posicao in [None, replace(cenario[ponta], tipo="CAIXINHA")]:
        partes = list(cenario)
        partes[ponta] = posicao
        with pytest.raises(ReaplicacaoInvalida):
            validar_reaplicacao(*partes, Dinheiro(1))


def test_rejeita_mesma_posicao_e_posicoes_incompativeis(cenario):
    resgate, aporte, origem, destino = cenario
    with pytest.raises(ReaplicacaoInvalida):
        validar_reaplicacao(
            resgate, replace(aporte, investimento_id=origem.id), origem, origem, Dinheiro(1)
        )
    with pytest.raises(ReaplicacaoInvalida):
        validar_reaplicacao(resgate, aporte, destino, origem, Dinheiro(1))


def test_rejeita_saldo_inicial(cenario):
    resgate, aporte, origem, destino = cenario
    inicial = replace(aporte, origem=OrigemDoMovimento.SALDO_INICIAL, conta_id=None)
    with pytest.raises(ReaplicacaoInvalida):
        validar_reaplicacao(resgate, inicial, origem, destino, Dinheiro(1))


def test_aceita_mesmo_dia_mas_rejeita_resgate_posterior(cenario):
    resgate, aporte, origem, destino = cenario
    validar_reaplicacao(replace(resgate, data=aporte.data), aporte, origem, destino, Dinheiro(1))
    with pytest.raises(ReaplicacaoInvalida):
        validar_reaplicacao(
            replace(resgate, data=aporte.data + timedelta(days=1)),
            aporte,
            origem,
            destino,
            Dinheiro(1),
        )


@pytest.mark.parametrize("valor", [0, -1])
def test_entidade_rejeita_valor_nao_positivo(valor):
    with pytest.raises(ReaplicacaoInvalida):
        ReaplicacaoDeResgate(uuid4(), uuid4(), Dinheiro(valor))


def test_entidade_rejeita_o_mesmo_movimento_nas_duas_pontas():
    movimento = uuid4()
    with pytest.raises(ReaplicacaoInvalida):
        ReaplicacaoDeResgate(movimento, movimento, Dinheiro(1))
