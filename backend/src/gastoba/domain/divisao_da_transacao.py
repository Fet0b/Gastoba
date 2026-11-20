from collections.abc import Sequence
from dataclasses import dataclass
from uuid import UUID

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.destinacao import Destinacao, repartir
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import DivisaoInvalida
from gastoba.domain.tag import Tag

MINIMO_DE_PARTES = 2
MAXIMO_DE_PARTES = 10


@dataclass(frozen=True, slots=True)
class ParteDaTransacao:
    """Uma parte de uma transação dividida: categoria (só na saída), tags e a fatia em %.

    A parte de saída com ``como_investimento`` é um aporte: não tem tags e pode trazer o
    investimento e as destinações (que somam 100%) da sua fatia.
    """

    categoria: CategoriaDoGasto | None
    tags: tuple[Tag, ...]
    percentual: int
    investimento_id: UUID | None = None
    destinacoes: tuple[Destinacao, ...] = ()
    como_investimento: bool = False


def dividir_valor(valor: Dinheiro, partes: Sequence[ParteDaTransacao]) -> list[Dinheiro]:
    """O valor de cada parte, em centavos inteiros, somando exatamente ``valor``.

    São de 2 a 10 partes, cada uma de 1 a 100%, somando 100%. O resto da divisão vai de 1 em 1
    centavo, começando pela primeira parte (a mesma regra das destinações).
    """
    if not MINIMO_DE_PARTES <= len(partes) <= MAXIMO_DE_PARTES:
        raise DivisaoInvalida(
            f"Divida a transação em {MINIMO_DE_PARTES} a {MAXIMO_DE_PARTES} partes."
        )
    for parte in partes:
        if isinstance(parte.percentual, bool) or not 1 <= parte.percentual <= 100:
            raise DivisaoInvalida("O percentual de cada parte deve ser um inteiro de 1 a 100.")
    if sum(parte.percentual for parte in partes) != 100:
        raise DivisaoInvalida("Os percentuais das partes devem somar 100%.")
    centavos = repartir(valor.centavos, [parte.percentual for parte in partes], 100)
    return [Dinheiro(parte) for parte in centavos]
