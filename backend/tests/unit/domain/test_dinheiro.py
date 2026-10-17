import dataclasses
from decimal import Decimal

import pytest

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ValorInvalido


@pytest.mark.parametrize(
    ("valor", "centavos_esperados"),
    [
        (Decimal("25.90"), 2590),
        ("25.90", 2590),
        (25, 2500),
        ("1.5", 150),
        ("1.500", 150),
        (-10, -1000),
    ],
)
def test_de_reais_converte_valores_validos_em_centavos(valor, centavos_esperados):
    assert Dinheiro.de_reais(valor).centavos == centavos_esperados


@pytest.mark.parametrize("valor", [0.1, True, None, [1]])
def test_de_reais_rejeita_float_bool_e_tipos_nao_suportados_com_type_error(valor):
    with pytest.raises(TypeError):
        Dinheiro.de_reais(valor)


@pytest.mark.parametrize(
    "valor",
    ["abc", "25,90", "NaN", Decimal("Infinity"), "1.234"],
)
def test_de_reais_rejeita_valores_invalidos(valor):
    with pytest.raises(ValorInvalido):
        Dinheiro.de_reais(valor)


@pytest.mark.parametrize(
    "valor",
    [
        "1E+999999",
        "1000000000000.01",
        "-1000000000000.01",
        "0.010000000000000000000000000001",
    ],
)
def test_de_reais_rejeita_valores_fora_do_limite_ou_com_fracoes_de_centavo(valor):
    with pytest.raises(ValorInvalido):
        Dinheiro.de_reais(valor)


@pytest.mark.parametrize(
    ("valor", "centavos_esperados"),
    [
        ("1000000000000.00", 10**14),
        ("-1000000000000.00", -(10**14)),
    ],
)
def test_de_reais_aceita_valores_exatamente_no_limite(valor, centavos_esperados):
    assert Dinheiro.de_reais(valor).centavos == centavos_esperados


@pytest.mark.parametrize("centavos", [10**14 + 1, -(10**14) - 1])
def test_construcao_direta_acima_do_limite_levanta_valor_invalido(centavos):
    with pytest.raises(ValorInvalido):
        Dinheiro(centavos)


def test_soma_que_ultrapassa_o_limite_levanta_valor_invalido():
    with pytest.raises(ValorInvalido):
        Dinheiro(10**14) + Dinheiro(1)


def test_soma_de_dinheiro_soma_os_centavos():
    total = Dinheiro.de_reais("1.10") + Dinheiro.de_reais("2.20")

    assert total.centavos == 330


def test_soma_com_algo_que_nao_e_dinheiro_levanta_type_error():
    with pytest.raises(TypeError):
        Dinheiro(1) + 1  # type: ignore[operator]


def test_subtracao_de_dinheiro_subtrai_os_centavos():
    assert Dinheiro(1000) - Dinheiro(2590) == Dinheiro(-1590)


def test_subtracao_que_ultrapassa_o_limite_levanta_valor_invalido():
    with pytest.raises(ValorInvalido):
        Dinheiro(-(10**14)) - Dinheiro(1)


def test_subtracao_com_algo_que_nao_e_dinheiro_levanta_type_error():
    with pytest.raises(TypeError):
        Dinheiro(1) - 1  # type: ignore[operator]


def test_em_reais_devolve_decimal_com_duas_casas():
    assert Dinheiro(2590).em_reais == Decimal("25.90")


@pytest.mark.parametrize(
    ("centavos", "texto_esperado"),
    [
        (123456, "R$ 1.234,56"),
        (5, "R$ 0,05"),
        (-1000, "-R$ 10,00"),
    ],
)
def test_str_formata_em_reais_no_padrao_brasileiro(centavos, texto_esperado):
    assert str(Dinheiro(centavos)) == texto_esperado


def test_dinheiro_e_imutavel():
    dinheiro = Dinheiro(100)

    with pytest.raises(dataclasses.FrozenInstanceError):
        dinheiro.centavos = 200  # type: ignore[misc]
