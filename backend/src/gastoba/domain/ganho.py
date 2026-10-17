from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum
from uuid import UUID, uuid4

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import DescricaoInvalida, TagInvalida, ValorInvalido
from gastoba.domain.tag import Tag

TAMANHO_MAXIMO_DA_DESCRICAO = 200
QUANTIDADE_MAXIMA_DE_TAGS = 10


class OrigemDoGanho(StrEnum):
    MANUAL = "manual"
    OPEN_FINANCE = "open_finance"


@dataclass(slots=True, eq=False)
class Ganho:
    """Entidade: dinheiro que entra numa conta (salário, reembolso). Não tem categoria."""

    conta_id: UUID
    valor: Dinheiro
    descricao: str
    data: date
    tags: tuple[Tag, ...] = ()
    origem: OrigemDoGanho = OrigemDoGanho.MANUAL
    # Preenchidos só nos lançamentos gerados por uma recorrência (competência AAAA-MM).
    recorrencia_id: UUID | None = None
    competencia: str | None = None
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        self.descricao = self.descricao.strip()
        if not self.descricao:
            raise DescricaoInvalida("A descrição do ganho não pode ser vazia.")
        if len(self.descricao) > TAMANHO_MAXIMO_DA_DESCRICAO:
            raise DescricaoInvalida(
                f"A descrição do ganho deve ter no máximo {TAMANHO_MAXIMO_DA_DESCRICAO} caracteres."
            )
        if self.valor.centavos <= 0:
            raise ValorInvalido("O valor do ganho deve ser positivo.")
        # Remove duplicatas preservando a ordem em que as tags foram informadas.
        self.tags = tuple(dict.fromkeys(self.tags))
        if len(self.tags) > QUANTIDADE_MAXIMA_DE_TAGS:
            raise TagInvalida(
                f"Um ganho pode ter no máximo {QUANTIDADE_MAXIMA_DE_TAGS} tags distintas."
            )

    def __eq__(self, outro: object) -> bool:
        if not isinstance(outro, Ganho):
            return NotImplemented
        return self.id == outro.id

    def __hash__(self) -> int:
        return hash(self.id)
