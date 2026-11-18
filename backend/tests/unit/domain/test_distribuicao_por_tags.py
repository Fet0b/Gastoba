from datetime import date
from uuid import uuid4

import pytest

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.distribuicao_por_tags import ResumoPorTags, dividir_entre_tags
from gastoba.domain.gasto import Gasto
from gastoba.domain.tag import Tag


def tags(*textos):
    return tuple(Tag.de_texto(texto) for texto in textos)


def gasto(centavos, *textos):
    return Gasto(
        conta_id=uuid4(),
        valor=Dinheiro(centavos),
        descricao="Compra",
        data=date(2026, 10, 10),
        categoria=CategoriaDoGasto.CONFORTO,
        tags=tags(*textos),
    )


def partes(centavos, *textos):
    return [parte.centavos for _, parte in dividir_entre_tags(Dinheiro(centavos), tags(*textos))]


def test_uma_tag_recebe_o_valor_inteiro():
    assert partes(2590, "mercado") == [2590]


def test_o_resto_vai_um_centavo_por_tag_comecando_pela_primeira():
    assert partes(1000, "a", "b", "c") == [334, 333, 333]


def test_um_centavo_com_duas_tags_fica_com_a_primeira():
    assert partes(1, "a", "b") == [1, 0]


def test_a_ordem_das_tags_e_preservada():
    resultado = dividir_entre_tags(Dinheiro(100), tags("pix", "mercado"))

    assert [str(tag) for tag, _ in resultado] == ["pix", "mercado"]


@pytest.mark.parametrize("quantidade", [1, 2, 3, 7, 10])
@pytest.mark.parametrize("valor", [1, 2, 100, 1000, 99_999_999_99])
def test_a_soma_das_partes_e_sempre_o_valor(valor, quantidade):
    textos = [f"t{i}" for i in range(quantidade)]

    assert sum(partes(valor, *textos)) == valor


def test_resumo_sem_gastos_e_vazio():
    resumo = ResumoPorTags.de_gastos([])

    assert resumo.total == Dinheiro(0)
    assert resumo.fatias == ()


def test_gasto_sem_tags_vai_para_a_fatia_sem_tag():
    resumo = ResumoPorTags.de_gastos([gasto(500), gasto(300, "pix")])

    assert [(fatia.tag, fatia.valor.centavos) for fatia in resumo.fatias] == [
        (None, 500),
        (Tag.de_texto("pix"), 300),
    ]


def test_a_soma_das_fatias_e_o_total():
    resumo = ResumoPorTags.de_gastos(
        [gasto(1000, "a", "b", "c"), gasto(1, "a", "b"), gasto(250), gasto(777, "b")]
    )

    assert resumo.total == Dinheiro(1000 + 1 + 250 + 777)
    assert sum(fatia.valor.centavos for fatia in resumo.fatias) == resumo.total.centavos


def test_mesma_tag_em_gastos_diferentes_vira_uma_fatia_so():
    resumo = ResumoPorTags.de_gastos([gasto(100, "mercado"), gasto(200, "Mercado")])

    assert [(str(fatia.tag), fatia.valor.centavos) for fatia in resumo.fatias] == [("mercado", 300)]


def test_fatia_de_valor_zero_e_omitida():
    resumo = ResumoPorTags.de_gastos([gasto(1, "a", "b")])

    assert [str(fatia.tag) for fatia in resumo.fatias] == ["a"]


def test_ordena_por_valor_decrescente_e_desempata_pela_tag():
    resumo = ResumoPorTags.de_gastos(
        [gasto(100, "zeta"), gasto(100, "alfa"), gasto(500, "meio"), gasto(100)]
    )

    # No empate, "sem tag" vem antes das tags (chave vazia); depois, ordem alfabética.
    assert [None if f.tag is None else str(f.tag) for f in resumo.fatias] == [
        "meio",
        None,
        "alfa",
        "zeta",
    ]


@pytest.mark.parametrize(
    "bruto,coberto,tags,esperado",
    [
        (8000, 3000, ["loja"], [("loja", 5000)]),
        (8001, 3000, ["loja", "online"], [("loja", 2501), ("online", 2500)]),
        (8000, 3000, [], [(None, 5000)]),
        (8000, 5000, ["loja"], [("loja", 3000)]),
        (8000, 8000, ["loja"], []),
        (8000, 0, ["loja"], [("loja", 8000)]),
        (8001, 8000, ["loja", "online"], [("loja", 1)]),
    ],
)
def test_rateia_liquido_apos_descontar_coberturas_sem_mutar_gasto(bruto, coberto, tags, esperado):
    from datetime import date
    from uuid import uuid4

    from gastoba.domain.categoria import CategoriaDoGasto
    from gastoba.domain.gasto import Gasto

    g = Gasto(
        uuid4(),
        Dinheiro(bruto),
        "Compra fictícia",
        date(2026, 10, 10),
        CategoriaDoGasto.CONFORTO,
        tuple(Tag.de_texto(t) for t in tags),
    )
    antes = (g.valor, g.tags, g.id, g.data, g.conta_id, g.descricao)
    resumo = ResumoPorTags.de_gastos([g], {g.id: Dinheiro(coberto)})
    assert [(str(f.tag) if f.tag else None, f.valor.centavos) for f in resumo.fatias] == esperado
    assert resumo.total == Dinheiro(bruto - coberto)
    assert sum(f.valor.centavos for f in resumo.fatias) == resumo.total.centavos
    assert (g.valor, g.tags, g.id, g.data, g.conta_id, g.descricao) == antes
