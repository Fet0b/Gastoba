import dataclasses

import pytest

from gastoba.domain.excecoes import TagInvalida
from gastoba.domain.tag import TAMANHO_MAXIMO_DA_TAG, Tag


def test_de_texto_normaliza_espacos_e_caixa():
    assert Tag.de_texto("  Mercado  Livre ") == Tag("mercado livre")


def test_de_texto_troca_tabulacao_por_espaco():
    assert Tag.de_texto("a\tb") == Tag("a b")


@pytest.mark.parametrize("texto", ["", "   "])
def test_de_texto_vazio_ou_so_espacos_e_invalido(texto):
    with pytest.raises(TagInvalida):
        Tag.de_texto(texto)


def test_tag_com_tamanho_maximo_e_valida():
    assert TAMANHO_MAXIMO_DA_TAG == 30
    assert Tag.de_texto("a" * 30).valor == "a" * 30


def test_tag_acima_do_tamanho_maximo_e_invalida():
    with pytest.raises(TagInvalida):
        Tag.de_texto("a" * 31)


def test_tag_com_caractere_nao_imprimivel_e_invalida():
    with pytest.raises(TagInvalida):
        Tag.de_texto("a\x00b")


@pytest.mark.parametrize("valor", ["Mercado", " x", "x ", "a  b", "a\tb"])
def test_construcao_direta_exige_valor_normalizado(valor):
    with pytest.raises(TagInvalida):
        Tag(valor)


def test_tags_iguais_por_valor_tem_mesmo_hash():
    assert len({Tag("pix"), Tag.de_texto("PIX")}) == 1


def test_str_devolve_o_valor():
    assert str(Tag("pix")) == "pix"


def test_tag_e_imutavel():
    tag = Tag("pix")

    with pytest.raises(dataclasses.FrozenInstanceError):
        tag.valor = "outra"  # type: ignore[misc]
