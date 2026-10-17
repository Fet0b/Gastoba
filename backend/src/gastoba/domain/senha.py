from dataclasses import dataclass, field

from gastoba.domain.excecoes import SenhaInvalida

TAMANHO_MINIMO_DA_SENHA = 10
# Teto para que uma senha enorme não torne o hash (caro de propósito) um vetor de abuso.
TAMANHO_MAXIMO_DA_SENHA = 128

_OCULTO = "***"


@dataclass(frozen=True, slots=True)
class SenhaEmClaro:
    """Senha digitada pela pessoa; existe só em memória e nunca aparece em repr/str/logs.

    Não é normalizada: espaços e maiúsculas fazem parte da senha.
    """

    valor: str = field(repr=False)

    def __post_init__(self) -> None:
        if not TAMANHO_MINIMO_DA_SENHA <= len(self.valor) <= TAMANHO_MAXIMO_DA_SENHA:
            raise SenhaInvalida(
                f"A senha deve ter de {TAMANHO_MINIMO_DA_SENHA} a "
                f"{TAMANHO_MAXIMO_DA_SENHA} caracteres."
            )

    def __repr__(self) -> str:
        return f"SenhaEmClaro({_OCULTO})"

    def __str__(self) -> str:
        return _OCULTO


@dataclass(frozen=True, slots=True)
class SenhaComHash:
    """Hash da senha, em formato opaco definido pelo ``HasherDeSenha``."""

    valor: str = field(repr=False)

    def __post_init__(self) -> None:
        if not self.valor:
            raise ValueError("O hash da senha não pode ser vazio.")
