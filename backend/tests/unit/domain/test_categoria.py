import pytest

from gastoba.domain.categoria import CategoriaDoGasto


def test_valores_exatos_na_ordem():
    assert [categoria.value for categoria in CategoriaDoGasto] == [
        "investimentos",
        "lazer",
        "conhecimento",
        "conforto",
        "gasto_fixo",
    ]


def test_criar_a_partir_do_valor_devolve_o_membro():
    assert CategoriaDoGasto("lazer") is CategoriaDoGasto.LAZER


def test_valor_desconhecido_levanta_value_error():
    with pytest.raises(ValueError):
        CategoriaDoGasto("outra")


@pytest.mark.parametrize(
    ("categoria", "nome"),
    [
        (CategoriaDoGasto.INVESTIMENTOS, "Investimentos"),
        (CategoriaDoGasto.LAZER, "Lazer"),
        (CategoriaDoGasto.CONHECIMENTO, "Conhecimento"),
        (CategoriaDoGasto.CONFORTO, "Conforto"),
        (CategoriaDoGasto.GASTO_FIXO, "Gasto fixo"),
    ],
)
def test_nome_para_exibicao(categoria, nome):
    assert categoria.nome == nome
