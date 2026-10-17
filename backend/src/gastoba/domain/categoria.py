from enum import StrEnum


class CategoriaDoGasto(StrEnum):
    """Conjunto fixo de categorias: diz "para quê" foi o gasto (as tags dizem "como e onde")."""

    INVESTIMENTOS = "investimentos"
    LAZER = "lazer"
    CONHECIMENTO = "conhecimento"
    CONFORTO = "conforto"
    GASTO_FIXO = "gasto_fixo"

    @property
    def nome(self) -> str:
        """Rótulo para exibição."""
        return _NOMES[self]


_NOMES = {
    CategoriaDoGasto.INVESTIMENTOS: "Investimentos",
    CategoriaDoGasto.LAZER: "Lazer",
    CategoriaDoGasto.CONHECIMENTO: "Conhecimento",
    CategoriaDoGasto.CONFORTO: "Conforto",
    CategoriaDoGasto.GASTO_FIXO: "Gasto fixo",
}
