from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Protocol

from gastoba.domain.dinheiro import Dinheiro

_DIAS_NO_ANO_INT = 365
_DOZE_MESES_EM_DIAS = 365
_DUAS_CASAS = Decimal("0.01")
_ITERACOES = 200
_TOLERANCIA = Decimal("1e-12")


@dataclass(frozen=True, slots=True)
class FluxoDeCaixa:
    """Dinheiro que saiu do bolso (negativo) ou voltou a ele (positivo), com a data."""

    data: date
    valor: Dinheiro


@dataclass(frozen=True, slots=True)
class ResultadoDaRentabilidade:
    """Percentuais com duas casas: retorno do período e anualizado (só com mais de 12 meses)."""

    periodo: Decimal
    anualizada: Decimal | None


@dataclass(frozen=True, slots=True)
class RentabilidadeIndisponivel:
    motivo: str


class EstrategiaDeRentabilidade(Protocol):
    def calcular(
        self, fluxos: Sequence[FluxoDeCaixa], valor_final: Dinheiro, data_final: date
    ) -> ResultadoDaRentabilidade | None: ...


class RentabilidadeXirr:
    """Retorno ponderado pelo dinheiro (XIRR), por bisseção determinística em ``Decimal``."""

    def calcular(
        self, fluxos: Sequence[FluxoDeCaixa], valor_final: Dinheiro, data_final: date
    ) -> ResultadoDaRentabilidade | None:
        if not fluxos or not any(f.valor.centavos < 0 for f in fluxos):
            return None
        ordenados = sorted(fluxos, key=lambda f: f.data)
        inicio = ordenados[0].data
        todos = [*ordenados, FluxoDeCaixa(data_final, valor_final)]
        pontos = [((f.data - inicio).days, Decimal(f.valor.centavos)) for f in todos]
        dias = (data_final - inicio).days
        if dias <= 0:
            aplicado = -sum(v for _, v in pontos if v < 0)
            retorno = sum(v for _, v in pontos if v > 0) / aplicado - 1
            return ResultadoDaRentabilidade(periodo=_em_percentual(retorno), anualizada=None)

        # Resolve o fator de crescimento DIÁRIO g (inteiros nas potências, sem expoente
        # fracionário): o período e o anualizado saem de g, e posições de poucos dias não
        # estouram o intervalo da busca como estourariam com a taxa anual.
        def valor_presente(g: Decimal) -> Decimal:
            return sum((v / (g**d) for d, v in pontos), Decimal(0))

        baixo, alto = Decimal("0.01"), Decimal(10)
        f_baixo, f_alto = valor_presente(baixo), valor_presente(alto)
        if f_baixo == 0:
            g = baixo
        elif f_alto == 0:
            g = alto
        elif (f_baixo > 0) == (f_alto > 0):
            return None
        else:
            for _ in range(_ITERACOES):
                meio = (baixo + alto) / 2
                f_meio = valor_presente(meio)
                if f_meio == 0 or (alto - baixo) < _TOLERANCIA:
                    baixo = alto = meio
                    break
                if (f_meio > 0) == (f_baixo > 0):
                    baixo, f_baixo = meio, f_meio
                else:
                    alto = meio
            g = (baixo + alto) / 2
        periodo = g**dias - 1
        anualizada = g**_DIAS_NO_ANO_INT - 1 if dias > _DOZE_MESES_EM_DIAS else None
        return ResultadoDaRentabilidade(
            periodo=_em_percentual(periodo),
            anualizada=_em_percentual(anualizada) if anualizada is not None else None,
        )


def _em_percentual(fracao: Decimal) -> Decimal:
    return (fracao * 100).quantize(_DUAS_CASAS, rounding=ROUND_HALF_UP)


def calcular_rentabilidade(
    estrategia: EstrategiaDeRentabilidade,
    *,
    historico_completo: bool,
    fluxos: Sequence[FluxoDeCaixa],
    valor_final: Dinheiro,
    data_final: date,
) -> ResultadoDaRentabilidade | RentabilidadeIndisponivel:
    """Sem histórico completo não há número: devolve o motivo, nunca um valor inventado."""
    if not historico_completo:
        return RentabilidadeIndisponivel("historico_incompleto")
    resultado = estrategia.calcular(fluxos, valor_final, data_final)
    if resultado is None:
        return RentabilidadeIndisponivel("sem_fluxos")
    return resultado
