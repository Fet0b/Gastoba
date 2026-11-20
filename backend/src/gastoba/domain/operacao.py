from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from enum import StrEnum
from uuid import UUID, uuid4

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import OperacaoInvalida


class TipoDeOperacao(StrEnum):
    COMPRA = "COMPRA"
    VENDA = "VENDA"
    PROVENTO = "PROVENTO"
    TAXA = "TAXA"
    IMPOSTO = "IMPOSTO"
    VENCIMENTO = "VENCIMENTO"
    ABERTURA = "ABERTURA"


class OrigemDaOperacao(StrEnum):
    PLUGGY = "pluggy"
    MANUAL = "manual"
    ABERTURA = "abertura"


@dataclass(frozen=True, slots=True)
class Operacao:
    """Evento do histórico de uma posição (compra, venda, provento, taxa, imposto, vencimento
    ou abertura). A quantidade é ``Decimal`` e o dinheiro é ``Dinheiro``, nunca ``float``."""

    posicao_id: UUID
    tipo: TipoDeOperacao
    data: date
    quantidade: Decimal
    valor_bruto: Dinheiro
    origem: OrigemDaOperacao
    custos: Dinheiro = field(default_factory=lambda: Dinheiro(0))
    id_externo: str | None = None
    operacao_relacionada_id: UUID | None = None
    # Derivada na migração (D1): "estimada, confirme". Nunca vale como histórico completo.
    quantidade_estimada: bool = False
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        if not isinstance(self.quantidade, Decimal) or not self.quantidade.is_finite():
            raise OperacaoInvalida("A quantidade precisa ser um número decimal finito.")
        if self.quantidade < 0:
            raise OperacaoInvalida("A quantidade não pode ser negativa.")
        if self.valor_bruto.centavos < 0:
            raise OperacaoInvalida("O valor bruto não pode ser negativo.")
        if self.custos.centavos < 0:
            raise OperacaoInvalida("Os custos não podem ser negativos.")
        if self.tipo == TipoDeOperacao.ABERTURA and self.id_externo is not None:
            raise OperacaoInvalida("A abertura não tem identificador externo.")
        if self.origem == OrigemDaOperacao.PLUGGY and not self.id_externo:
            raise OperacaoInvalida("A operação da corretora precisa do identificador externo.")
        if (
            self.tipo in (TipoDeOperacao.TAXA, TipoDeOperacao.IMPOSTO)
            and self.operacao_relacionada_id is None
        ):
            raise OperacaoInvalida("Taxa e imposto precisam apontar para a operação relacionada.")

    @property
    def imutavel_pela_pessoa(self) -> bool:
        return self.origem == OrigemDaOperacao.PLUGGY
