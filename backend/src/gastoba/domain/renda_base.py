from dataclasses import dataclass
from uuid import UUID

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ValorInvalido


@dataclass(frozen=True, slots=True)
class RendaBase:
    """Previsão mensal da pessoa, usada somente como referência para as metas."""

    usuario_id: UUID
    valor: Dinheiro

    def __post_init__(self) -> None:
        if self.valor.centavos <= 0:
            raise ValorInvalido("A renda-base deve ter valor positivo.")
