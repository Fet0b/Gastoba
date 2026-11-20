from datetime import date
from uuid import uuid4

import pytest

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.gasto import Gasto
from gastoba.domain.tag import Tag


def test_cobertura_limites_e_preservacao():
    from gastoba.domain.cobertura_de_compra import ReservaDaDestinacao, validar_cobertura
    from gastoba.domain.excecoes import CategoriaInvalida, CoberturaInvalida, CoberturaJaExiste

    g = Gasto(
        uuid4(),
        Dinheiro(8000),
        "Compra fictícia",
        date(2026, 10, 10),
        CategoriaDoGasto.CONFORTO,
        (),
    )
    tag = Tag("celular")
    r = ReservaDaDestinacao(g.categoria, tag, Dinheiro(10000), Dinheiro(2000))
    assert r.disponivel == Dinheiro(8000)
    assert validar_cobertura(g, tag, Dinheiro(8000), Dinheiro(0), r, frozenset()).valor == g.valor
    for valor, anterior in [(0, 0), (-1, 0), (8001, 0), (5001, 3000)]:
        with pytest.raises(CoberturaInvalida):
            validar_cobertura(g, tag, Dinheiro(valor), Dinheiro(anterior), r, frozenset())
    with pytest.raises(CoberturaJaExiste):
        validar_cobertura(g, tag, Dinheiro(1), Dinheiro(0), r, frozenset([tag]))
    outra = ReservaDaDestinacao(CategoriaDoGasto.LAZER, tag, Dinheiro(10000), Dinheiro(0))
    with pytest.raises(CoberturaInvalida):
        validar_cobertura(g, tag, Dinheiro(1), Dinheiro(0), outra, frozenset())
    g.categoria = CategoriaDoGasto.INVESTIMENTOS
    with pytest.raises(CategoriaInvalida):
        validar_cobertura(g, tag, Dinheiro(1), Dinheiro(0), r, frozenset())
