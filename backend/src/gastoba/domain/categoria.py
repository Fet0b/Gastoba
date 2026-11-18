from enum import StrEnum

from gastoba.domain.excecoes import CategoriaInvalida


class CategoriaDoGasto(StrEnum):
    """Conjunto fixo de categorias: diz "para quê" foi o gasto (as tags dizem "como e onde")."""

    INVESTIMENTOS = "investimentos"
    LAZER = "lazer"
    CONHECIMENTO = "conhecimento"
    CONFORTO = "conforto"
    GASTO_FIXO = "gasto_fixo"

    @property
    def legada(self) -> bool:
        return self is CategoriaDoGasto.INVESTIMENTOS

    @classmethod
    def ativas(cls) -> tuple[CategoriaDoGasto, ...]:
        return tuple(c for c in cls if not c.legada)

    @property
    def nome(self) -> str:
        """Rótulo para exibição."""
        return _NOMES[self]


_NOMES = {
    CategoriaDoGasto.INVESTIMENTOS: "Investimentos (antiga)",
    CategoriaDoGasto.LAZER: "Lazer",
    CategoriaDoGasto.CONHECIMENTO: "Conhecimento",
    CategoriaDoGasto.CONFORTO: "Conforto",
    CategoriaDoGasto.GASTO_FIXO: "Gasto fixo",
}


def exigir_categoria_ativa(categoria: CategoriaDoGasto) -> None:
    if categoria.legada:
        raise CategoriaInvalida(
            "A categoria Investimentos foi substituída: use o aporte em investimento "
            "e a meta Liberdade financeira."
        )
