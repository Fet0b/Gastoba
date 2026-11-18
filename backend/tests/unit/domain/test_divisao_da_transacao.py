import pytest

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.divisao_da_transacao import ParteDaTransacao, dividir_valor
from gastoba.domain.excecoes import DivisaoInvalida


def parte(percentual, categoria=CategoriaDoGasto.LAZER):
    return ParteDaTransacao(categoria=categoria, tags=(), percentual=percentual)


def test_soma_exatamente_o_valor_com_o_resto_na_primeira():
    valores = dividir_valor(Dinheiro(10001), [parte(33), parte(33), parte(34)])

    assert [v.centavos for v in valores] == [3301, 3300, 3400]
    assert sum(v.centavos for v in valores) == 10001


@pytest.mark.parametrize("percentual", [0, -1, 101, True])
def test_percentual_de_1_a_100(percentual):
    with pytest.raises(DivisaoInvalida):
        dividir_valor(Dinheiro(1000), [parte(percentual), parte(50)])


def test_precisa_de_2_a_10_partes_somando_100():
    with pytest.raises(DivisaoInvalida):
        dividir_valor(Dinheiro(1000), [parte(100)])
    with pytest.raises(DivisaoInvalida):
        dividir_valor(Dinheiro(1000), [parte(50), parte(40)])
    with pytest.raises(DivisaoInvalida):
        dividir_valor(Dinheiro(1000), [parte(10)] * 11)
    assert len(dividir_valor(Dinheiro(1000), [parte(10)] * 10)) == 10


def test_valor_pequeno_nao_perde_centavo():
    assert [v.centavos for v in dividir_valor(Dinheiro(1), [parte(50), parte(50)])] == [1, 0]
