"""O guardado para comprar nas metas (066): só exibição, nunca altera limite, gasto nem situação."""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from gastoba.domain.categoria import CategoriaDoGasto, exigir_categoria_ativa
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import GuardadoInvalido
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    OrigemDoMovimento,
    TipoDeMovimento,
)
from gastoba.domain.tag import Tag

LIMITE_DE_CAIXINHAS_MARCADAS = 20


@dataclass(frozen=True, slots=True)
class CaixinhaMarcada:
    """Uma caixinha (destinação) marcada como guardada para compras de uma categoria."""

    categoria: CategoriaDoGasto
    tag: Tag

    def __post_init__(self) -> None:
        exigir_categoria_ativa(self.categoria)


@dataclass(frozen=True, slots=True)
class GuardadoNasMetas:
    """A preferência da pessoa: se mostra o guardado e quais caixinhas estão marcadas."""

    ativo: bool
    marcacoes: tuple[CaixinhaMarcada, ...]

    def __post_init__(self) -> None:
        if len(self.marcacoes) > LIMITE_DE_CAIXINHAS_MARCADAS:
            raise GuardadoInvalido(
                f"No máximo {LIMITE_DE_CAIXINHAS_MARCADAS} caixinhas podem ser marcadas."
            )
        if len({m.tag for m in self.marcacoes}) != len(self.marcacoes):
            raise GuardadoInvalido("Cada caixinha só pode ser marcada em uma categoria.")


@dataclass(frozen=True, slots=True)
class GuardadoDaCategoria:
    valor: Dinheiro
    tags: tuple[Tag, ...]


def guardado_por_categoria(
    movimentos: Iterable[tuple[MovimentoDeInvestimento, Sequence[tuple[Tag, Dinheiro]]]],
    marcacoes: Iterable[CaixinhaMarcada],
) -> dict[CategoriaDoGasto, GuardadoDaCategoria]:
    """O guardado do período em cada categoria: aportes menos resgates das caixinhas marcadas.

    O saldo inicial não é dinheiro novo e fica de fora; realocação e as outras operações não
    contam. O sinal vem do tipo do movimento, não do sinal gravado na parte. O total nunca fica
    abaixo de zero (categoria sem guardado não aparece) e as caixinhas listadas são as que
    ficaram com saldo positivo, em ordem alfabética.
    """
    categoria_da_tag = {m.tag: m.categoria for m in marcacoes}
    por_tag: dict[Tag, int] = {}
    for movimento, partes in movimentos:
        if movimento.origem is OrigemDoMovimento.SALDO_INICIAL:
            continue
        if movimento.tipo is TipoDeMovimento.APORTE:
            sinal = 1
        elif movimento.tipo is TipoDeMovimento.RESGATE:
            sinal = -1
        else:
            continue
        for tag, valor in partes:
            if tag in categoria_da_tag:
                por_tag[tag] = por_tag.get(tag, 0) + sinal * abs(valor.centavos)
    totais: dict[CategoriaDoGasto, int] = {}
    for tag, centavos in por_tag.items():
        categoria = categoria_da_tag[tag]
        totais[categoria] = totais.get(categoria, 0) + centavos
    resultado: dict[CategoriaDoGasto, GuardadoDaCategoria] = {}
    for categoria, total in totais.items():
        if total <= 0:
            continue
        tags = sorted(
            (t for t, c in por_tag.items() if categoria_da_tag[t] is categoria and c > 0),
            key=lambda t: t.valor,
        )
        resultado[categoria] = GuardadoDaCategoria(Dinheiro(total), tuple(tags))
    return resultado


def percentual_guardado(guardado: Dinheiro, limite: Dinheiro) -> int:
    """``guardado * 100 // limite``; zero com limite zero; mínimo 1 quando há guardado."""
    if guardado.centavos <= 0 or limite.centavos <= 0:
        return 0
    return max(1, guardado.centavos * 100 // limite.centavos)
