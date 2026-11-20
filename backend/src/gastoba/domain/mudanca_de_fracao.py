from collections.abc import Hashable, Mapping
from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from uuid import UUID, uuid4

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import DestinacaoInvalida, PrincipalInsuficiente
from gastoba.domain.tag import Tag


class MotivoDaMudancaDeFracao(Enum):
    # A parte "sem caixinha" (compra nova) passou a uma caixinha.
    ALOCACAO = "alocacao"
    # Parte da fração de uma caixinha passou a outra, na mesma posição.
    REALOCACAO = "realocacao"


@dataclass(frozen=True, slots=True)
class MudancaDeFracao:
    """Entidade: mudança datada da fração (peso, em centavos de principal) de uma caixinha numa
    posição por fração. Sem origem, é a alocação da parte sem caixinha; com origem, é a
    realocação de uma caixinha para outra. Só registra: quem move os pesos é o caso de uso."""

    posicao_id: UUID
    data: date
    destino: Tag
    valor: Dinheiro
    origem: Tag | None = None
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        if self.valor.centavos <= 0:
            raise DestinacaoInvalida("O valor da mudança de fração deve ser positivo.")
        if self.origem == self.destino:
            raise DestinacaoInvalida("A origem e o destino da realocação devem ser diferentes.")

    @property
    def motivo(self) -> MotivoDaMudancaDeFracao:
        if self.origem is None:
            return MotivoDaMudancaDeFracao.ALOCACAO
        return MotivoDaMudancaDeFracao.REALOCACAO

    def __eq__(self, outro: object) -> bool:
        if not isinstance(outro, MudancaDeFracao):
            return NotImplemented
        return self.id == outro.id

    def __hash__(self) -> int:
        return hash(self.id)


def mover_fracao[Chave: Hashable](
    pesos: Mapping[Chave, int], origem: Chave, destino: Chave, centavos: int
) -> dict[Chave, int]:
    """Os pesos depois de passar ``centavos`` da origem ao destino; a soma não muda.

    A origem que fica com peso zero sai do resultado; o destino sem peso ganha um. Recusa mover
    mais do que a origem tem (``PrincipalInsuficiente``). Não altera ``pesos``.
    """
    if origem == destino:
        raise DestinacaoInvalida("A origem e o destino da realocação devem ser diferentes.")
    if centavos <= 0:
        raise DestinacaoInvalida("O valor da realocação deve ser positivo.")
    if pesos.get(origem, 0) < centavos:
        raise PrincipalInsuficiente("A realocação passa da fração da caixinha.")
    novos = dict(pesos)
    novos[origem] -= centavos
    if novos[origem] == 0:
        del novos[origem]
    novos[destino] = novos.get(destino, 0) + centavos
    return novos
