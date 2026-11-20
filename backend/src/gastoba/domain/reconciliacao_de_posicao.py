from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum


class TipoDePendencia(StrEnum):
    FALTAM_COTAS = "faltam_cotas"
    SOBRAM_COTAS = "sobram_cotas"


@dataclass(frozen=True, slots=True)
class PendenciaDeReconciliacao:
    tipo: TipoDePendencia
    quantidade_estimada: Decimal


@dataclass(frozen=True, slots=True)
class ResultadoDaReconciliacao:
    historico_completo: bool
    pendencias: tuple[PendenciaDeReconciliacao, ...]


def reconciliar_por_quantidade(
    observada: Decimal | None, calculada: Decimal
) -> ResultadoDaReconciliacao:
    """Compara a quantidade observada na corretora com a explicada pelas operações.

    Observada desconhecida deixa o histórico incompleto, sem inventar pendência numérica.
    """
    if observada is None:
        return ResultadoDaReconciliacao(False, ())
    if observada == calculada:
        return ResultadoDaReconciliacao(True, ())
    if observada > calculada:
        pendencia = PendenciaDeReconciliacao(TipoDePendencia.FALTAM_COTAS, observada - calculada)
    else:
        pendencia = PendenciaDeReconciliacao(TipoDePendencia.SOBRAM_COTAS, calculada - observada)
    return ResultadoDaReconciliacao(False, (pendencia,))


def historico_das_operacoes(
    observada: Decimal | None, calculada: Decimal, alguma_quantidade_estimada: bool
) -> ResultadoDaReconciliacao:
    """Como ``reconciliar_por_quantidade``, mas uma quantidade estimada (migração) nunca fecha o
    histórico: a rentabilidade só aparece depois que a pessoa confirma ou completa as operações."""
    resultado = reconciliar_por_quantidade(observada, calculada)
    if alguma_quantidade_estimada and resultado.historico_completo:
        return ResultadoDaReconciliacao(False, resultado.pendencias)
    return resultado
