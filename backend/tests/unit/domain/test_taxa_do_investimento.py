from decimal import Decimal

import pytest

from gastoba.domain.taxa_do_investimento import TaxaDoInvestimento, taxa_do_registro


def test_percentual_do_indexador_sem_adicional():
    assert taxa_do_registro(101.2, "CDI", 0) == TaxaDoInvestimento(Decimal("101.2"), "CDI", None)


def test_adicional_zero_nao_aparece_e_positivo_aparece():
    assert taxa_do_registro(100, "CDI", 0).adicional_anual is None
    assert taxa_do_registro(100, "IPCA", "5.5").adicional_anual == Decimal("5.5")


def test_numero_sai_sem_zeros_a_direita():
    taxa = taxa_do_registro("101.20", "CDI", "0.0")
    assert (str(taxa.percentual), taxa.adicional_anual) == ("101.2", None)
    assert str(taxa_do_registro(100.0, "CDI", None).percentual) == "100"


def test_so_o_adicional_anual_tambem_e_uma_taxa():
    assert taxa_do_registro(None, None, "12.5") == TaxaDoInvestimento(None, None, Decimal("12.5"))


def test_indexador_e_aparado_e_vazio_vira_nulo():
    assert taxa_do_registro(100, "  CDI ", None).indexador == "CDI"
    assert taxa_do_registro(100, "   ", None).indexador is None


@pytest.mark.parametrize(
    ("percentual", "indexador", "adicional"),
    [
        (None, None, None),
        (0, "CDI", 0),
        (None, "CDI", None),
        (-1, "CDI", None),
        ("abc", "CDI", "x"),
        (float("nan"), "CDI", float("inf")),
        (True, "CDI", False),
    ],
)
def test_sem_taxa_utilizavel_nao_ha_taxa(percentual, indexador, adicional):
    assert taxa_do_registro(percentual, indexador, adicional) is None
