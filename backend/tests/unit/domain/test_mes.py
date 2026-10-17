from datetime import UTC, date, datetime

import pytest

from gastoba.domain.excecoes import MesInvalido
from gastoba.domain.mes import Mes, hoje_no_fuso_do_negocio


def test_de_texto_le_ano_e_mes():
    assert Mes.de_texto("2026-10") == Mes(2026, 10)
    assert str(Mes(26, 3)) == "0026-03"


@pytest.mark.parametrize(
    "texto",
    [
        "",
        "2026",
        "2026-1",
        "26-10",
        "2026-13",
        "2026-00",
        "2026-10-01",
        "abcd-ef",
        "\uff12\uff10\uff12\uff16-10",
        "2026/10",
    ],
)
def test_de_texto_recusa_formatos_invalidos(texto):
    with pytest.raises(MesInvalido):
        Mes.de_texto(texto)


@pytest.mark.parametrize(("ano", "mes"), [(0, 1), (10000, 1), (2026, 0), (2026, 13)])
def test_recusa_ano_e_mes_fora_do_intervalo(ano, mes):
    with pytest.raises(MesInvalido):
        Mes(ano, mes)


def test_inicio_e_fim_do_mes_inclusive_em_ano_bissexto():
    assert Mes(2026, 10).inicio == date(2026, 10, 1)
    assert Mes(2026, 10).fim == date(2026, 10, 31)
    assert Mes(2024, 2).fim == date(2024, 2, 29)
    assert Mes(2026, 2).fim == date(2026, 2, 28)
    assert Mes(2026, 4).fim == date(2026, 4, 30)


def test_proximo_vira_o_ano_em_dezembro():
    assert Mes(2026, 12).proximo() == Mes(2027, 1)
    assert Mes(2026, 3).proximo() == Mes(2026, 4)


def test_dia_do_mes_vale_o_ultimo_dia_em_mes_mais_curto():
    assert Mes(2026, 2).dia(31) == date(2026, 2, 28)
    assert Mes(2024, 2).dia(30) == date(2024, 2, 29)
    assert Mes(2026, 10).dia(31) == date(2026, 10, 31)
    assert Mes(2026, 4).dia(31) == date(2026, 4, 30)
    assert Mes(2026, 10).dia(5) == date(2026, 10, 5)


def test_meses_se_ordenam_cronologicamente():
    assert Mes(2025, 12) < Mes(2026, 1) < Mes(2026, 2)


def test_hoje_no_fuso_do_negocio_usa_brasilia_e_nao_utc():
    # 01:00 UTC do dia 1º ainda é a noite do dia 31 em Brasília (UTC-3).
    assert hoje_no_fuso_do_negocio(datetime(2026, 11, 1, 1, 0, tzinfo=UTC)) == date(2026, 10, 31)
    assert hoje_no_fuso_do_negocio(datetime(2026, 11, 1, 3, 0, tzinfo=UTC)) == date(2026, 11, 1)
