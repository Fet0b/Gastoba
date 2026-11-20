from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

TAMANHO_MAXIMO_DO_INDEXADOR = 30


@dataclass(frozen=True, slots=True)
class TaxaDoInvestimento:
    """A remuneração contratada, como a instituição informa (ex.: ``101.2% CDI + 1.5% a.a.``).

    ``percentual`` é o percentual do ``indexador`` (ou a taxa, se não há indexador) e
    ``adicional_anual`` é a parte fixa ao ano somada a ele. O que é zero não existe: ``101.2% CDI
    + 0% a.a.`` é só ``101.2% CDI``.
    """

    percentual: Decimal | None
    indexador: str | None
    adicional_anual: Decimal | None


def _numero_positivo(valor: object) -> Decimal | None:
    """O número sem zeros à direita, ou ``None`` se não é um número finito maior que zero."""
    if valor is None or isinstance(valor, bool):
        return None
    try:
        numero = Decimal(str(valor))
    except InvalidOperation:
        return None
    if not numero.is_finite() or numero <= 0:
        return None
    normalizado = numero.normalize()
    return normalizado if normalizado.as_tuple().exponent <= 0 else normalizado.quantize(Decimal(1))


def taxa_do_registro(
    percentual: object, indexador: object, adicional_anual: object
) -> TaxaDoInvestimento | None:
    """A taxa a partir dos campos soltos do registro da instituição; ``None`` se não há taxa."""
    parte = _numero_positivo(percentual)
    adicional = _numero_positivo(adicional_anual)
    if parte is None and adicional is None:
        return None
    nome = indexador.strip()[:TAMANHO_MAXIMO_DO_INDEXADOR] if isinstance(indexador, str) else ""
    return TaxaDoInvestimento(parte, (nome or None) if parte is not None else None, adicional)
