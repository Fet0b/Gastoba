from dataclasses import dataclass
from uuid import UUID

from gastoba.domain.excecoes import ValorInvalido


@dataclass(frozen=True, slots=True)
class AlocacaoDeCaixinha:
    """Fração de uma posição reservada para uma caixinha (destinação). O peso, em centavos,
    só define a proporção do rateio; a alocação não tem custo nem quantidade."""

    posicao_id: UUID
    destinacao_id: UUID
    peso_centavos: int

    def __post_init__(self) -> None:
        if self.peso_centavos <= 0:
            raise ValorInvalido("O peso da alocação precisa ser positivo.")
