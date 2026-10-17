from dataclasses import dataclass

from gastoba.domain.excecoes import EmailInvalido

TAMANHO_MINIMO_DO_EMAIL = 3
TAMANHO_MAXIMO_DO_EMAIL = 254


@dataclass(frozen=True, slots=True)
class Email:
    """Endereço de e-mail do usuário, sempre normalizado (sem espaços nas pontas, minúsculo).

    A validação é propositalmente simples: um único ``@`` com texto dos dois lados.
    """

    valor: str

    @classmethod
    def de_texto(cls, texto: str) -> Email:
        """Normaliza o texto digitado (ex.: ``"  Ana@X.com "`` → ``"ana@x.com"``)."""
        return cls(texto.strip().lower())

    def __post_init__(self) -> None:
        if not TAMANHO_MINIMO_DO_EMAIL <= len(self.valor) <= TAMANHO_MAXIMO_DO_EMAIL:
            raise EmailInvalido(
                f"O e-mail deve ter de {TAMANHO_MINIMO_DO_EMAIL} a "
                f"{TAMANHO_MAXIMO_DO_EMAIL} caracteres."
            )
        local, arroba, dominio = self.valor.partition("@")
        if not arroba or not local or not dominio or "@" in dominio:
            raise EmailInvalido("O e-mail deve ter um único @, com texto antes e depois.")
        if not self.valor.isprintable() or any(c.isspace() for c in self.valor):
            raise EmailInvalido("O e-mail não pode ter espaços nem caracteres não imprimíveis.")
        if self.valor != self.valor.lower():
            raise EmailInvalido("O e-mail precisa estar normalizado; use Email.de_texto.")

    def __str__(self) -> str:
        return self.valor
