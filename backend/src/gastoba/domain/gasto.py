from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum
from uuid import UUID, uuid4

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import DescricaoInvalida, TagInvalida, ValorInvalido
from gastoba.domain.tag import Tag

TAMANHO_MAXIMO_DA_DESCRICAO = 200
QUANTIDADE_MAXIMA_DE_TAGS = 10


class OrigemDoGasto(StrEnum):
    MANUAL = "manual"
    OPEN_FINANCE = "open_finance"


@dataclass(slots=True, eq=False)
class Gasto:
    """Entidade: um gasto tem identidade própria (``id``), não só valor."""

    conta_id: UUID
    valor: Dinheiro
    descricao: str
    data: date
    categoria: CategoriaDoGasto
    tags: tuple[Tag, ...] = ()
    origem: OrigemDoGasto = OrigemDoGasto.MANUAL
    # Preenchidos só nos lançamentos gerados por uma recorrência (competência AAAA-MM).
    recorrencia_id: UUID | None = None
    competencia: str | None = None
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        self.descricao = self.descricao.strip()
        if not self.descricao:
            raise DescricaoInvalida("A descrição do gasto não pode ser vazia.")
        if len(self.descricao) > TAMANHO_MAXIMO_DA_DESCRICAO:
            raise DescricaoInvalida(
                f"A descrição do gasto deve ter no máximo {TAMANHO_MAXIMO_DA_DESCRICAO} caracteres."
            )
        if self.valor.centavos <= 0:
            raise ValorInvalido("O valor do gasto deve ser positivo.")
        # Remove duplicatas preservando a ordem em que as tags foram informadas.
        self.tags = tuple(dict.fromkeys(self.tags))
        if len(self.tags) > QUANTIDADE_MAXIMA_DE_TAGS:
            raise TagInvalida(
                f"Um gasto pode ter no máximo {QUANTIDADE_MAXIMA_DE_TAGS} tags distintas."
            )

    def __eq__(self, outro: object) -> bool:
        if not isinstance(outro, Gasto):
            return NotImplemented
        return self.id == outro.id

    def __hash__(self) -> int:
        return hash(self.id)
