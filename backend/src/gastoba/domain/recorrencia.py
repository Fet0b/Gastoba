from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum
from uuid import UUID, uuid4

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    DescricaoInvalida,
    RecorrenciaInvalida,
    TagInvalida,
    ValorInvalido,
)
from gastoba.domain.mes import Mes
from gastoba.domain.tag import Tag

TAMANHO_MAXIMO_DA_DESCRICAO = 200
QUANTIDADE_MAXIMA_DE_TAGS = 10
LIMITE_DE_RECORRENCIAS_ATIVAS = 50
# Quanto o início pode estar no passado: cada mês até hoje vira um lançamento na geração.
ANOS_MAXIMOS_NO_PASSADO = 5


class TipoDeRecorrencia(StrEnum):
    GANHO = "ganho"
    GASTO = "gasto"


@dataclass(slots=True, eq=False)
class Recorrencia:
    """Modelo mensal que gera um ganho ou um gasto por mês, no ``dia_do_mes``.

    Em mês mais curto vale o último dia. O gasto exige categoria; o ganho não tem.
    """

    usuario_id: UUID
    tipo: TipoDeRecorrencia
    conta_id: UUID
    valor: Dinheiro
    descricao: str
    dia_do_mes: int
    inicio: date
    categoria: CategoriaDoGasto | None = None
    tags: tuple[Tag, ...] = ()
    fim: date | None = None
    ativa: bool = True
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        self.descricao = self.descricao.strip()
        if not self.descricao:
            raise DescricaoInvalida("A descrição da recorrência não pode ser vazia.")
        if len(self.descricao) > TAMANHO_MAXIMO_DA_DESCRICAO:
            raise DescricaoInvalida(
                f"A descrição da recorrência deve ter no máximo "
                f"{TAMANHO_MAXIMO_DA_DESCRICAO} caracteres."
            )
        if self.valor.centavos <= 0:
            raise ValorInvalido("O valor da recorrência deve ser positivo.")
        if not 1 <= self.dia_do_mes <= 31:
            raise RecorrenciaInvalida("O dia do mês da recorrência deve ser de 1 a 31.")
        if self.tipo is TipoDeRecorrencia.GASTO and self.categoria is None:
            raise RecorrenciaInvalida("A recorrência de gasto precisa de uma categoria.")
        if self.tipo is TipoDeRecorrencia.GANHO and self.categoria is not None:
            raise RecorrenciaInvalida("A recorrência de ganho não tem categoria.")
        if self.fim is not None and self.fim < self.inicio:
            raise RecorrenciaInvalida("O fim da recorrência não pode ser antes do início.")
        # Remove duplicatas preservando a ordem em que as tags foram informadas.
        self.tags = tuple(dict.fromkeys(self.tags))
        if len(self.tags) > QUANTIDADE_MAXIMA_DE_TAGS:
            raise TagInvalida(
                f"Uma recorrência pode ter no máximo {QUANTIDADE_MAXIMA_DE_TAGS} tags distintas."
            )

    def ocorrencias_ate(self, hoje: date) -> list[tuple[Mes, date]]:
        """Os meses (e as datas) já vencidos até ``hoje``, do início ao mês de ``hoje``.

        Só entram as datas dentro de ``inicio`` e ``fim`` (inclusivos) e que não passam de hoje.
        """
        ocorrencias: list[tuple[Mes, date]] = []
        mes = Mes.de_data(self.inicio)
        ultimo = Mes.de_data(hoje)
        while mes <= ultimo:
            data = mes.dia(self.dia_do_mes)
            if self.inicio <= data <= hoje and (self.fim is None or data <= self.fim):
                ocorrencias.append((mes, data))
            if mes.ano == 9999 and mes.mes == 12:
                break
            mes = mes.proximo()
        return ocorrencias

    def __eq__(self, outro: object) -> bool:
        if not isinstance(outro, Recorrencia):
            return NotImplemented
        return self.id == outro.id

    def __hash__(self) -> int:
        return hash(self.id)
