from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from gastoba.domain.excecoes import ValorInvalido

_CENTAVOS_POR_REAL = 100
_DUAS_CASAS = Decimal("0.01")

# R$ 1 trilhão: cabe com folga nos inteiros de 64 bits do SQLite, inclusive em somas.
LIMITE_CENTAVOS = 10**14
LIMITE_REAIS = Decimal(LIMITE_CENTAVOS).scaleb(-2)


@dataclass(frozen=True, slots=True)
class Dinheiro:
    """Quantia em reais, armazenada em centavos inteiros para evitar arredondamentos.

    Aceita zero e negativos: a regra "gasto tem valor positivo" é da entidade Gasto.
    """

    centavos: int

    def __post_init__(self) -> None:
        if abs(self.centavos) > LIMITE_CENTAVOS:
            raise ValorInvalido(
                f"Valor monetário acima do limite de {LIMITE_CENTAVOS} centavos: {self.centavos}."
            )

    @classmethod
    def de_reais(cls, valor: Decimal | int | str) -> Dinheiro:
        """Cria a quantia a partir de reais (ex.: ``"25.90"``). Nunca aceita ``float``."""
        # bool é subclasse de int; precisa ser barrado antes de qualquer checagem de int.
        if isinstance(valor, bool):
            raise TypeError("Dinheiro não aceita bool como valor.")
        if isinstance(valor, float):
            raise TypeError("Dinheiro não aceita float; use Decimal, int ou str.")
        if not isinstance(valor, Decimal | int | str):
            raise TypeError(f"Tipo não suportado para Dinheiro: {type(valor).__name__}.")

        try:
            reais = Decimal(valor)
        except InvalidOperation as erro:
            raise ValorInvalido(f"Valor monetário não numérico: {valor!r}.") from erro

        if not reais.is_finite():
            raise ValorInvalido(f"Valor monetário não finito: {valor!r}.")

        try:
            # Comparação exata no Decimal, antes de qualquer aritmética: abs() arredondaria
            # para a precisão do contexto, e "1E+999999" * 100 estouraria.
            if reais.copy_abs() > LIMITE_REAIS:
                raise ValorInvalido(
                    f"Valor monetário acima do limite de R$ {LIMITE_REAIS}: {valor!r}."
                )
            quantizado = reais.quantize(_DUAS_CASAS)
            if quantizado != reais:
                raise ValorInvalido(f"Valor monetário com centavos fracionários: {valor!r}.")
            return cls(int(quantizado * _CENTAVOS_POR_REAL))
        except ArithmeticError as erro:
            raise ValorInvalido(f"Valor monetário fora do intervalo aceito: {valor!r}.") from erro

    @property
    def em_reais(self) -> Decimal:
        """Quantia em reais como Decimal com duas casas (ex.: ``Decimal("25.90")``)."""
        return (Decimal(self.centavos) / _CENTAVOS_POR_REAL).quantize(_DUAS_CASAS)

    def __add__(self, outro: Dinheiro) -> Dinheiro:
        if not isinstance(outro, Dinheiro):
            return NotImplemented
        return Dinheiro(self.centavos + outro.centavos)

    def __sub__(self, outro: Dinheiro) -> Dinheiro:
        if not isinstance(outro, Dinheiro):
            return NotImplemented
        return Dinheiro(self.centavos - outro.centavos)

    def percentual(self, percentual: int) -> Dinheiro:
        """``percentual``% desta quantia, arredondado para baixo, em centavos inteiros."""
        return Dinheiro(self.centavos * percentual // 100)

    def __str__(self) -> str:
        """Formata em pt-BR sem depender de locale: ``R$ 1.234,56``, ``-R$ 10,00``."""
        sinal = "-" if self.centavos < 0 else ""
        reais, centavos = divmod(abs(self.centavos), _CENTAVOS_POR_REAL)
        reais_com_milhar = f"{reais:,}".replace(",", ".")
        return f"{sinal}R$ {reais_com_milhar},{centavos:02d}"
