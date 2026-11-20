from datetime import date
from decimal import Decimal

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.rentabilidade import (
    FluxoDeCaixa,
    RentabilidadeIndisponivel,
    RentabilidadeXirr,
    ResultadoDaRentabilidade,
    calcular_rentabilidade,
)

INICIO = date(2025, 1, 1)


def _aplicar(valor, dia=INICIO):
    return FluxoDeCaixa(dia, Dinheiro(-valor))


def test_um_ano_exato_nao_anualiza_so_o_periodo():
    resultado = RentabilidadeXirr().calcular([_aplicar(100000)], Dinheiro(110000), date(2026, 1, 1))
    assert resultado == ResultadoDaRentabilidade(periodo=Decimal("10.00"), anualizada=None)


def test_mais_de_doze_meses_traz_o_anualizado():
    resultado = RentabilidadeXirr().calcular([_aplicar(100000)], Dinheiro(121000), date(2027, 1, 1))
    assert resultado.periodo == Decimal("21.00")
    assert resultado.anualizada == Decimal("10.00")


def test_posicao_recente_nao_gera_taxa_anual_enganosa():
    resultado = RentabilidadeXirr().calcular(
        [_aplicar(100000)], Dinheiro(101000), date(2025, 1, 11)
    )
    assert resultado.periodo == Decimal("1.00")
    assert resultado.anualizada is None


def test_retorno_negativo():
    resultado = RentabilidadeXirr().calcular([_aplicar(100000)], Dinheiro(90000), date(2025, 7, 1))
    assert resultado.periodo == Decimal("-10.00")


def test_varios_fluxos_datados_sao_ponderados_pelo_dinheiro():
    # 1000 no inicio e 1000 seis meses depois, valendo 2200 ao fim de um ano.
    resultado = RentabilidadeXirr().calcular(
        [_aplicar(100000), _aplicar(100000, date(2025, 7, 2))],
        Dinheiro(220000),
        date(2026, 1, 1),
    )
    assert resultado.periodo > Decimal("0")
    assert isinstance(resultado.periodo, Decimal)


def test_resgate_parcial_entra_como_fluxo_positivo():
    resultado = RentabilidadeXirr().calcular(
        [_aplicar(100000), FluxoDeCaixa(date(2025, 7, 1), Dinheiro(50000))],
        Dinheiro(60000),
        date(2026, 1, 1),
    )
    assert resultado.periodo > Decimal("0")


def test_sem_fluxos_ou_sem_aplicacao_nao_ha_resultado():
    assert RentabilidadeXirr().calcular([], Dinheiro(100), INICIO) is None
    assert (
        RentabilidadeXirr().calcular([FluxoDeCaixa(INICIO, Dinheiro(100))], Dinheiro(0), INICIO)
        is None
    )


def test_resultado_e_decimal_nunca_float():
    resultado = RentabilidadeXirr().calcular([_aplicar(100000)], Dinheiro(110000), date(2026, 1, 1))
    assert type(resultado.periodo) is Decimal


def test_historico_incompleto_devolve_o_motivo():
    resultado = calcular_rentabilidade(
        RentabilidadeXirr(),
        historico_completo=False,
        fluxos=[_aplicar(100000)],
        valor_final=Dinheiro(110000),
        data_final=date(2026, 1, 1),
    )
    assert resultado == RentabilidadeIndisponivel("historico_incompleto")


def test_outra_estrategia_entra_sem_mudar_o_chamador():
    class Fixa:
        def calcular(self, fluxos, valor_final, data_final):
            return ResultadoDaRentabilidade(periodo=Decimal("1.00"), anualizada=None)

    resultado = calcular_rentabilidade(
        Fixa(),
        historico_completo=True,
        fluxos=[_aplicar(100)],
        valor_final=Dinheiro(101),
        data_final=INICIO,
    )
    assert resultado.periodo == Decimal("1.00")


def test_historico_completo_sem_resultado_numerico_fica_indisponivel():
    resultado = calcular_rentabilidade(
        RentabilidadeXirr(),
        historico_completo=True,
        fluxos=[],
        valor_final=Dinheiro(0),
        data_final=INICIO,
    )
    assert isinstance(resultado, RentabilidadeIndisponivel)
