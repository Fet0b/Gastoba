from dataclasses import dataclass

from gastoba.domain.excecoes import TagInvalida

TAMANHO_MAXIMO_DA_TAG = 30


@dataclass(frozen=True, slots=True)
class Tag:
    """Rótulo livre de um gasto, sempre normalizado (minúsculas, espaços simples)."""

    valor: str

    @classmethod
    def de_texto(cls, texto: str) -> Tag:
        """Normaliza o texto digitado (ex.: ``"  Mercado  Livre "`` → ``"mercado livre"``)."""
        return cls(" ".join(texto.split()).lower())

    def __post_init__(self) -> None:
        if not 1 <= len(self.valor) <= TAMANHO_MAXIMO_DA_TAG:
            raise TagInvalida(f"A tag deve ter de 1 a {TAMANHO_MAXIMO_DA_TAG} caracteres.")
        if not self.valor.isprintable():
            raise TagInvalida("A tag não pode ter caracteres não imprimíveis.")
        if self.valor != " ".join(self.valor.split()).lower():
            raise TagInvalida("A tag precisa estar normalizada; use Tag.de_texto.")

    def __str__(self) -> str:
        return self.valor
