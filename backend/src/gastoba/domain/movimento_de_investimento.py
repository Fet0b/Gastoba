from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum
from uuid import UUID, uuid4

from gastoba.domain.categoria import CategoriaDoGasto, exigir_categoria_ativa
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    CategoriaInvalida,
    DescricaoInvalida,
    RevisaoNaoPendente,
    TransacaoImportadaInvalida,
    ValorInvalido,
)

TAMANHO_MAXIMO_DA_DESCRICAO = 200
DESCRICAO_DO_SALDO_INICIAL = "Saldo inicial"


class TipoDeMovimento(StrEnum):
    APORTE = "aporte"
    RESGATE = "resgate"
    RENDIMENTO = "rendimento"
    CUSTO = "custo"
    IMPOSTO = "imposto"


class OrigemDoMovimento(StrEnum):
    MANUAL = "manual"  # só nos gastos antigos convertidos pela migration
    OPEN_FINANCE = "open_finance"
    # A parte da posição que já existia antes de qualquer aporte registrado: não sai de conta.
    SALDO_INICIAL = "saldo_inicial"


@dataclass(slots=True, eq=False)
class MovimentoDeInvestimento:
    """Entidade: dinheiro que sai de uma conta para um investimento (aporte) ou volta (resgate).

    É separado de gasto e ganho; aporte categorizado entra nas métricas de despesa. O
    investimento só é associado depois; até lá ``investimento_id`` fica nulo. Só o saldo inicial
    (aporte já associado ao investimento) não tem conta.
    """

    conta_id: UUID | None
    tipo: TipoDeMovimento
    valor: Dinheiro
    descricao: str
    data: date
    investimento_id: UUID | None = None
    origem: OrigemDoMovimento = OrigemDoMovimento.OPEN_FINANCE
    id: UUID = field(default_factory=uuid4)
    transacao_importada_id: UUID | None = None

    categoria: CategoriaDoGasto | None = None
    revisao_contabil_pendente: bool = False
    revisao_pendente: bool = False
    movimento_relacionado_id: UUID | None = None

    vencimento_confirmado: bool = False

    def classificar_vencimento(self, vencimento: bool) -> None:
        if self.tipo != TipoDeMovimento.RESGATE:
            raise TransacaoImportadaInvalida(
                "Somente resgate pode ser classificado como vencimento."
            )
        self.vencimento_confirmado = vencimento

    def __post_init__(self) -> None:
        self._validar_categoria(self.categoria)
        if self.tipo in (TipoDeMovimento.CUSTO, TipoDeMovimento.IMPOSTO):
            if self.investimento_id is None or self.movimento_relacionado_id is None:
                raise TransacaoImportadaInvalida(
                    "Custo e imposto exigem posição e operação relacionada."
                )
        elif self.movimento_relacionado_id is not None:
            raise TransacaoImportadaInvalida("Só custo e imposto têm operação relacionada.")
        if self.tipo == TipoDeMovimento.RENDIMENTO and self.investimento_id is None:
            raise TransacaoImportadaInvalida("Escolha o investimento do rendimento.")
        self.descricao = self.descricao.strip()
        if not self.descricao:
            raise DescricaoInvalida("A descrição do movimento não pode ser vazia.")
        if len(self.descricao) > TAMANHO_MAXIMO_DA_DESCRICAO:
            raise DescricaoInvalida(
                f"A descrição do movimento deve ter no máximo {TAMANHO_MAXIMO_DA_DESCRICAO} "
                "caracteres."
            )
        if self.valor.centavos <= 0:
            raise ValorInvalido("O valor do movimento deve ser positivo.")
        # Invariantes que nenhuma entrada da API alcança: erro de programação, não de negócio.
        if (self.conta_id is None) != (self.origem == OrigemDoMovimento.SALDO_INICIAL):
            raise ValueError("Só o movimento de saldo inicial fica sem conta.")
        if self.origem == OrigemDoMovimento.SALDO_INICIAL and (
            self.tipo != TipoDeMovimento.APORTE or self.investimento_id is None
        ):
            raise ValueError("O saldo inicial é um aporte já associado a um investimento.")

    def _validar_categoria(self, categoria: CategoriaDoGasto | None) -> None:
        if categoria is not None:
            exigir_categoria_ativa(categoria)
            if (
                self.tipo != TipoDeMovimento.APORTE
                or self.origem == OrigemDoMovimento.SALDO_INICIAL
            ):
                raise CategoriaInvalida(
                    "Categoria só vale em aporte, nunca em saldo inicial ou resgate."
                )

    def revisar(self, categoria: CategoriaDoGasto | None) -> None:
        if not (self.revisao_pendente or self.revisao_contabil_pendente):
            raise RevisaoNaoPendente("Este aporte não está pendente de revisão.")
        exigir_movimento_sem_categoria(categoria)
        self.categoria = categoria
        self.revisao_pendente = False
        self.revisao_contabil_pendente = False

    @classmethod
    def de_saldo_inicial(
        cls, investimento_id: UUID, valor: Dinheiro, data: date
    ) -> MovimentoDeInvestimento:
        """O aporte que representa a parte da posição ainda sem principal, sem sair de conta."""
        return cls(
            conta_id=None,
            tipo=TipoDeMovimento.APORTE,
            valor=valor,
            descricao=DESCRICAO_DO_SALDO_INICIAL,
            data=data,
            investimento_id=investimento_id,
            origem=OrigemDoMovimento.SALDO_INICIAL,
        )

    def __eq__(self, outro: object) -> bool:
        if not isinstance(outro, MovimentoDeInvestimento):
            return NotImplemented
        return self.id == outro.id

    def __hash__(self) -> int:
        return hash(self.id)


def exigir_movimento_sem_categoria(categoria: CategoriaDoGasto | None) -> None:
    if categoria is not None:
        raise TransacaoImportadaInvalida("Aporte e resgate não têm categoria de despesa.")
