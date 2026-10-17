from collections.abc import Iterable
from dataclasses import dataclass

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.gasto import Gasto
from gastoba.domain.tag import Tag


def dividir_entre_tags(valor: Dinheiro, tags: tuple[Tag, ...]) -> list[tuple[Tag, Dinheiro]]:
    """Divide o valor em partes iguais entre as tags, em centavos inteiros.

    O resto da divisão vai de 1 em 1 centavo, começando pela primeira tag, então a
    soma das partes é sempre exatamente ``valor``.
    """
    quantidade = len(tags)
    base, resto = divmod(valor.centavos, quantidade)
    return [
        (tag, Dinheiro(base + (1 if posicao < resto else 0))) for posicao, tag in enumerate(tags)
    ]


@dataclass(frozen=True, slots=True)
class FatiaPorTag:
    """Parte do total que cabe a uma tag; ``tag`` é ``None`` para os gastos sem tag."""

    tag: Tag | None
    valor: Dinheiro


@dataclass(frozen=True, slots=True)
class ResumoPorTags:
    """Distribuição do total dos gastos entre as tags; a soma das fatias é o total."""

    total: Dinheiro
    fatias: tuple[FatiaPorTag, ...]

    @classmethod
    def de_gastos(cls, gastos: Iterable[Gasto]) -> ResumoPorTags:
        por_tag: dict[Tag | None, int] = {}
        total = 0
        for gasto in gastos:
            total += gasto.valor.centavos
            if not gasto.tags:
                por_tag[None] = por_tag.get(None, 0) + gasto.valor.centavos
                continue
            for tag, parte in dividir_entre_tags(gasto.valor, gasto.tags):
                por_tag[tag] = por_tag.get(tag, 0) + parte.centavos
        fatias = [
            FatiaPorTag(tag, Dinheiro(centavos)) for tag, centavos in por_tag.items() if centavos
        ]
        # Valor decrescente; no empate, "sem tag" primeiro e depois as tags em ordem crescente.
        fatias.sort(key=lambda f: (-f.valor.centavos, "" if f.tag is None else str(f.tag)))
        return cls(total=Dinheiro(total), fatias=tuple(fatias))
