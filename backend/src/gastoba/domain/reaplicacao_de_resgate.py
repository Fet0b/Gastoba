from dataclasses import dataclass, field
from uuid import UUID, uuid4

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ReaplicacaoInvalida
from gastoba.domain.investimento import Investimento
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    OrigemDoMovimento,
    TipoDeMovimento,
)


@dataclass(frozen=True, slots=True)
class ReaplicacaoDeResgate:
    resgate_id: UUID
    aporte_id: UUID
    valor: Dinheiro
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        if self.resgate_id == self.aporte_id or self.valor.centavos <= 0:
            raise ReaplicacaoInvalida("Escolha movimentos distintos e um valor positivo.")


def validar_reaplicacao(
    resgate: MovimentoDeInvestimento,
    aporte: MovimentoDeInvestimento,
    origem: Investimento | None,
    destino: Investimento | None,
    valor: Dinheiro,
    coberto: Dinheiro | None = None,
) -> None:
    coberto = coberto if coberto is not None else Dinheiro(0)
    if (
        resgate.tipo != TipoDeMovimento.RESGATE
        or aporte.tipo != TipoDeMovimento.APORTE
        or aporte.origem == OrigemDoMovimento.SALDO_INICIAL
        or origem is None
        or destino is None
        or origem.id != resgate.investimento_id
        or destino.id != aporte.investimento_id
        or origem.id == destino.id
        or origem.tipo == "CAIXINHA"
        or destino.tipo == "CAIXINHA"
    ):
        raise ReaplicacaoInvalida(
            "Escolha um resgate e um aporte de investimentos distintos, "
            "fora de conta investimentos e saldo inicial."
        )
    if resgate.data > aporte.data:
        raise ReaplicacaoInvalida("O resgate precisa ocorrer na mesma data ou antes do aporte.")
    if (
        valor.centavos <= 0
        or valor.centavos > aporte.valor.centavos
        or valor.centavos > (resgate.valor - coberto).centavos
    ):
        raise ReaplicacaoInvalida(
            "O valor deve ser positivo e caber no aporte e no resgate ainda livre de coberturas."
        )
