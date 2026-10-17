import calendar
from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo

from gastoba.domain.excecoes import MesInvalido

ANO_MINIMO = 1
ANO_MAXIMO = 9999
# O dia a dia do negócio é em Brasília; só a geração das recorrências pergunta "que dia é hoje".
FUSO_DO_NEGOCIO = "America/Sao_Paulo"


def hoje_no_fuso_do_negocio(agora: datetime) -> date:
    """O dia do calendário em Brasília no instante ``agora`` (que precisa ter fuso)."""
    return agora.astimezone(ZoneInfo(FUSO_DO_NEGOCIO)).date()


@dataclass(frozen=True, slots=True, order=True)
class Mes:
    """Mês do calendário (ano e mês), com os limites em dias; o texto é ``AAAA-MM``."""

    ano: int
    mes: int

    def __post_init__(self) -> None:
        if not ANO_MINIMO <= self.ano <= ANO_MAXIMO or not 1 <= self.mes <= 12:
            raise MesInvalido("O mês deve ser AAAA-MM, com mês de 01 a 12 e ano de 0001 a 9999.")

    @classmethod
    def de_texto(cls, texto: str) -> Mes:
        partes = texto.split("-")
        if (
            len(partes) != 2
            or len(partes[0]) != 4
            or len(partes[1]) != 2
            or not all(parte.isascii() and parte.isdigit() for parte in partes)
        ):
            raise MesInvalido("O mês deve ser AAAA-MM, com mês de 01 a 12 e ano de 0001 a 9999.")
        return cls(int(partes[0]), int(partes[1]))

    @classmethod
    def de_data(cls, data: date) -> Mes:
        return cls(data.year, data.month)

    @property
    def inicio(self) -> date:
        return date(self.ano, self.mes, 1)

    @property
    def fim(self) -> date:
        """Último dia do mês, inclusive em fevereiro de ano bissexto."""
        return date(self.ano, self.mes, calendar.monthrange(self.ano, self.mes)[1])

    def proximo(self) -> Mes:
        return Mes(self.ano + 1, 1) if self.mes == 12 else Mes(self.ano, self.mes + 1)

    def dia(self, dia_do_mes: int) -> date:
        """O ``dia_do_mes`` neste mês; em mês mais curto, o último dia."""
        return date(self.ano, self.mes, min(dia_do_mes, self.fim.day))

    def __str__(self) -> str:
        return f"{self.ano:04d}-{self.mes:02d}"
