from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from gastoba.domain.excecoes import ErroDeDominio
from gastoba.domain.meta import AlvoDaMeta


class AcaoDoHistoricoDeMeta(StrEnum):
    CRIADA = "criada"
    ALTERADA = "alterada"
    REMOVIDA = "removida"


@dataclass(frozen=True, slots=True)
class HistoricoDeMeta:
    usuario_id: UUID
    alvo: AlvoDaMeta
    percentual_anterior: int | None
    percentual_novo: int | None
    acao: AcaoDoHistoricoDeMeta
    instante: datetime
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        a, n = self.percentual_anterior, self.percentual_novo
        coerente = {
            "criada": a is None and n is not None,
            "alterada": a is not None and n is not None and a != n,
            "removida": a is not None and n is None,
        }
        if (
            not coerente.get(self.acao, False)
            or any(v is not None and (type(v) is not int or not 1 <= v <= 100) for v in (a, n))
            or self.instante.tzinfo is None
        ):
            raise ErroDeDominio("Histórico de meta inválido.")
