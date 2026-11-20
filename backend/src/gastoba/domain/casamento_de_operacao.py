from dataclasses import dataclass, field
from enum import StrEnum
from uuid import UUID, uuid4

from gastoba.domain.excecoes import OperacaoInvalida


class EstadoDoCasamento(StrEnum):
    SUGERIDO = "sugerido"
    CONFIRMADO = "confirmado"


class PapelDoVinculo(StrEnum):
    BRUTO = "bruto"
    TAXA = "taxa"
    IMPOSTO = "imposto"


@dataclass(frozen=True, slots=True)
class VinculoDeCasamento:
    transacao_importada_id: UUID
    papel: PapelDoVinculo


@dataclass(frozen=True, slots=True)
class CasamentoDeOperacao:
    """Ligação confirmada (e desfazível) entre transações da conta e uma ou mais operações (um
    débito de pregão pode pagar várias compras)."""

    operacao_ids: tuple[UUID, ...]
    vinculos: tuple[VinculoDeCasamento, ...]
    estado: EstadoDoCasamento = EstadoDoCasamento.CONFIRMADO
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        if not self.operacao_ids:
            raise OperacaoInvalida("O casamento precisa de ao menos uma operação.")
        if len(self.operacao_ids) != len(set(self.operacao_ids)):
            raise OperacaoInvalida("Uma operação não pode aparecer duas vezes no casamento.")
        if not any(v.papel == PapelDoVinculo.BRUTO for v in self.vinculos):
            raise OperacaoInvalida("O casamento precisa de ao menos o débito bruto.")
        ids = [v.transacao_importada_id for v in self.vinculos]
        if len(ids) != len(set(ids)):
            raise OperacaoInvalida("Uma transação não pode aparecer duas vezes no casamento.")
