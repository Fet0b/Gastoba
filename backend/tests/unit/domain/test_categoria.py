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
        (CategoriaDoGasto.INVESTIMENTOS, "Investimentos (antiga)"),
        (CategoriaDoGasto.LAZER, "Lazer"),
        (CategoriaDoGasto.CONHECIMENTO, "Conhecimento"),
        (CategoriaDoGasto.CONFORTO, "Conforto"),
        (CategoriaDoGasto.GASTO_FIXO, "Gasto fixo"),
    ],
)
def test_nome_para_exibicao(categoria, nome):
    assert categoria.nome == nome


def test_categorias_ativas_e_legada():
    from gastoba.domain.categoria import exigir_categoria_ativa
    from gastoba.domain.excecoes import CategoriaInvalida

    assert CategoriaDoGasto.ativas() == tuple(list(CategoriaDoGasto)[1:])
    for categoria in CategoriaDoGasto:
        assert categoria.legada == (categoria is CategoriaDoGasto.INVESTIMENTOS)
        if categoria.legada:
            with pytest.raises(CategoriaInvalida, match="Liberdade financeira"):
                exigir_categoria_ativa(categoria)
        else:
            exigir_categoria_ativa(categoria)
