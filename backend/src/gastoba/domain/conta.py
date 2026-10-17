from dataclasses import dataclass, field
from enum import StrEnum
from uuid import UUID, uuid4

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import NomeInvalido

TAMANHO_MAXIMO_DO_NOME_DA_CONTA = 100


class OrigemDaConta(StrEnum):
    MANUAL = "manual"
    OPEN_FINANCE = "open_finance"


class TipoDaConta(StrEnum):
    """Conta corrente (ou carteira, poupança) ou cartão de crédito."""

    CORRENTE = "corrente"
    CARTAO = "cartao"


@dataclass(slots=True, eq=False)
class Conta:
    """Entidade: conta de um usuário (carteira, banco), com saldo que pode ficar negativo."""

    usuario_id: UUID
    nome: str
    saldo: Dinheiro
    origem: OrigemDaConta = OrigemDaConta.MANUAL
    # Id da conta no provedor de Open Finance; só nas contas importadas.
    id_externo: str | None = None
    id: UUID = field(default_factory=uuid4)
    tipo: TipoDaConta = TipoDaConta.CORRENTE

    def __post_init__(self) -> None:
        self.nome = self.nome.strip()
        if not self.nome:
            raise NomeInvalido("O nome da conta não pode ser vazio.")
        if len(self.nome) > TAMANHO_MAXIMO_DO_NOME_DA_CONTA:
            raise NomeInvalido(
                f"O nome da conta deve ter no máximo {TAMANHO_MAXIMO_DO_NOME_DA_CONTA} caracteres."
            )

    @property
    def saldo_e_do_banco(self) -> bool:
        """Conta importada: o saldo espelha o do banco e lançamentos não o alteram."""
        return self.origem != OrigemDaConta.MANUAL

    def debitar(self, valor: Dinheiro) -> None:
        """Subtrai ``valor`` do saldo; ``ValorInvalido`` (do Dinheiro) se passar do limite."""
        self.saldo = self.saldo - valor

    def creditar(self, valor: Dinheiro) -> None:
        """Soma ``valor`` ao saldo; ``ValorInvalido`` (do Dinheiro) se passar do limite."""
        self.saldo = self.saldo + valor

    def __eq__(self, outro: object) -> bool:
        if not isinstance(outro, Conta):
            return NotImplemented
        return self.id == outro.id

    def __hash__(self) -> int:
        return hash(self.id)
