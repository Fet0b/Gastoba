from uuid import uuid4

import pytest

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import PercentualInvalido
from gastoba.domain.meta import Meta, ProgressoDaMeta, SituacaoDaMeta


def meta(percentual) -> Meta:
    return Meta(usuario_id=uuid4(), categoria=CategoriaDoGasto.LAZER, percentual=percentual)


@pytest.mark.parametrize("percentual", [1, 30, 100])
def test_percentual_de_1_a_100_e_aceito(percentual):
    assert meta(percentual).percentual == percentual


@pytest.mark.parametrize("percentual", [0, -5, 101, True])
def test_percentual_fora_de_1_a_100_e_recusado(percentual):
    with pytest.raises(PercentualInvalido):
        meta(percentual)


def progresso(percentual=30, renda=100000, gasto=0) -> ProgressoDaMeta:
    return ProgressoDaMeta(
        categoria=CategoriaDoGasto.LAZER,
        percentual=percentual,
        renda=Dinheiro(renda),
        gasto=Dinheiro(gasto),
    )


def test_limite_e_o_percentual_da_renda_arredondado_para_baixo():
    assert progresso(percentual=30, renda=100000).limite == Dinheiro(30000)
    assert progresso(percentual=33, renda=100).limite == Dinheiro(33)
    assert progresso(percentual=1, renda=199).limite == Dinheiro(1)


@pytest.mark.parametrize(
    ("gasto", "situacao"),
    [
        (0, SituacaoDaMeta.DENTRO),
        (23999, SituacaoDaMeta.DENTRO),  # 79,99% do limite de 30000
        (24000, SituacaoDaMeta.ALERTA),  # exatamente 80%
        (30000, SituacaoDaMeta.ALERTA),  # exatamente o limite ainda não estourou
        (30001, SituacaoDaMeta.ESTOUROU),
        (90000, SituacaoDaMeta.ESTOUROU),
    ],
)
def test_situacao_pelos_limites_de_80_e_100_por_cento(gasto, situacao):
    assert progresso(gasto=gasto).situacao == situacao


def test_percentual_usado_e_inteiro_para_baixo_e_passa_de_100_ao_estourar():
    assert progresso(gasto=0).percentual_usado == 0
    assert progresso(gasto=10000).percentual_usado == 33
    assert progresso(gasto=30000).percentual_usado == 100
    assert progresso(gasto=45000).percentual_usado == 150


def test_restante_fica_negativo_quando_estoura():
    assert progresso(gasto=10000).restante == Dinheiro(20000)
    assert progresso(gasto=38000).restante == Dinheiro(-8000)


@pytest.mark.parametrize("renda", [0, -100])
def test_sem_renda_a_meta_nao_e_avaliada(renda):
    resultado = progresso(renda=renda, gasto=5000)

    assert resultado.situacao == SituacaoDaMeta.SEM_RENDA
    assert resultado.limite.centavos <= 0


def test_renda_minuscula_com_limite_zero_estoura_se_houver_gasto():
    sem_gasto = progresso(percentual=1, renda=50, gasto=0)
    com_gasto = progresso(percentual=1, renda=50, gasto=1)

    assert sem_gasto.limite == Dinheiro(0)
    assert sem_gasto.situacao == SituacaoDaMeta.DENTRO
    assert com_gasto.situacao == SituacaoDaMeta.ESTOUROU
    assert com_gasto.percentual_usado is None


def test_dinheiro_percentual_arredonda_para_baixo():
    assert Dinheiro(1001).percentual(50) == Dinheiro(500)
    assert Dinheiro(0).percentual(30) == Dinheiro(0)
    assert Dinheiro(100).percentual(100) == Dinheiro(100)
