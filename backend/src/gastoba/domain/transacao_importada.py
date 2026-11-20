from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum
from uuid import UUID, uuid4

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    DescricaoInvalida,
    MovimentoNaoDesfazivel,
    TransacaoImportadaInvalida,
    TransacaoJaTratada,
    ValorInvalido,
)

TAMANHO_MAXIMO_DA_DESCRICAO = 200
DESCRICAO_PADRAO = "Sem descrição"

# Operações que quase sempre não são gasto nem renda de verdade: pagar a fatura do cartão (o
# gasto já entrou pelas compras), mover dinheiro entre contas do próprio dono e estornos.
OPERACOES_QUE_PEDEM_DESCARTE = frozenset(
    {"PAGAMENTO_FATURA", "TRANSFERENCIA_MESMA_INSTITUICAO", "ESTORNO"}
)

# Operações que a importação já grava como ignoradas, sem passar pela caixa de entrada: pagar a
# fatura e mover dinheiro entre as próprias contas nunca são gasto nem renda. O estorno fica de
# fora: às vezes é renda de verdade, então só pede descarte.
OPERACOES_DESCARTADAS_NA_IMPORTACAO = frozenset(
    {"TRANSFERENCIA_MESMA_INSTITUICAO", "PAGAMENTO_FATURA"}
)


def motivo_do_descarte_na_importacao(
    tipo_de_operacao: str | None, descricao: str = ""
) -> MotivoDaTransacaoIgnorada | None:
    """O motivo com que a transação entra ignorada, se a descrição a mostra como movimento interno.

    A aplicação e o resgate automáticos da conta investimentos só movem o saldo parado dentro da
    própria conta: reconhece-se pela descrição, nunca pelo tipo (a emissão de CDB tem o mesmo tipo
    do resgate automático).
    """
    from gastoba.domain.natureza_do_movimento import NaturezaDoMovimento, natureza_da_descricao

    if natureza_da_descricao(descricao) == NaturezaDoMovimento.CONTA_REMUNERADA:
        return MotivoDaTransacaoIgnorada.MOVIMENTO_INTERNO_DA_CONTA
    return None


def descartar_na_importacao(tipo_de_operacao: str | None, descricao: str = "") -> bool:
    """A transação entra já ignorada: pelo tipo da operação ou por ser movimento interno."""
    return (
        tipo_de_operacao in OPERACOES_DESCARTADAS_NA_IMPORTACAO
        or motivo_do_descarte_na_importacao(tipo_de_operacao, descricao) is not None
    )


class SentidoDaTransacao(StrEnum):
    ENTRADA = "entrada"
    SAIDA = "saida"


class MotivoDaTransacaoIgnorada(StrEnum):
    TRANSFERENCIA_ENTRE_CONTAS = "transferencia_entre_contas"
    # Aplicação e resgate automáticos da conta investimentos: o dinheiro não sai da conta.
    MOVIMENTO_INTERNO_DA_CONTA = "movimento_interno_da_conta"


class EstadoDaTransacaoImportada(StrEnum):
    PENDENTE = "pendente"
    ACEITA = "aceita"
    IGNORADA = "ignorada"


@dataclass(slots=True, eq=False)
class TransacaoImportada:
    """Entidade: transação vinda do banco que espera a decisão da pessoa (a caixa de entrada).

    Só vira gasto ou ganho quando é aceita; até lá não mexe em nada do resto do sistema.
    """

    conta_id: UUID
    id_externo: str
    data: date
    descricao: str
    valor: Dinheiro
    sentido: SentidoDaTransacao
    tipo_de_operacao: str | None = None
    estado: EstadoDaTransacaoImportada = EstadoDaTransacaoImportada.PENDENTE
    id: UUID = field(default_factory=uuid4)
    # Só em compras de cartão: a fatura (id externo do banco) e a parcela, se o banco informa.
    id_externo_da_fatura: str | None = None
    parcela_numero: int | None = None
    parcela_total: int | None = None
    motivo_ignorada: MotivoDaTransacaoIgnorada | None = None

    def __post_init__(self) -> None:
        # O texto vem do banco: aparar e limitar ao tamanho da descrição de gasto e ganho.
        self.descricao = self.descricao.strip()[:TAMANHO_MAXIMO_DA_DESCRICAO].strip()
        if not self.descricao:
            self.descricao = DESCRICAO_PADRAO
        if not self.id_externo.strip():
            raise DescricaoInvalida("A transação importada precisa de um identificador externo.")
        if self.valor.centavos <= 0:
            raise ValorInvalido("O valor da transação importada deve ser positivo.")

    @property
    def sugerir_descarte(self) -> bool:
        return self.tipo_de_operacao in OPERACOES_QUE_PEDEM_DESCARTE

    def reabrir(self) -> None:
        if self.estado != EstadoDaTransacaoImportada.ACEITA:
            raise MovimentoNaoDesfazivel("Só uma transação aceita pode voltar à caixa de entrada.")
        self.estado = EstadoDaTransacaoImportada.PENDENTE
        self.motivo_ignorada = None

    def devolver_a_caixa(self) -> None:
        """Reabre a aceita; o movimento interno da conta não tem classificação: fica ignorado."""
        self.reabrir()
        motivo = motivo_do_descarte_na_importacao(self.tipo_de_operacao, self.descricao)
        if motivo is not None:
            self.ignorar(motivo)

    def reaceitar(self) -> None:
        """Desfaz ``devolver_a_caixa``: pendente ou movimento interno ignorado volta a aceita."""
        interno = self.motivo_ignorada == MotivoDaTransacaoIgnorada.MOVIMENTO_INTERNO_DA_CONTA
        if interno and self.estado == EstadoDaTransacaoImportada.IGNORADA:
            self.estado = EstadoDaTransacaoImportada.PENDENTE
            self.motivo_ignorada = None
        self.aceitar()

    def restaurar(self) -> None:
        if self.motivo_ignorada == MotivoDaTransacaoIgnorada.MOVIMENTO_INTERNO_DA_CONTA:
            raise TransacaoJaTratada(
                "O movimento interno da conta não tem classificação: não volta à caixa de entrada."
            )
        if self.estado != EstadoDaTransacaoImportada.IGNORADA:
            raise TransacaoJaTratada("Só uma transação ignorada pode voltar à caixa de entrada.")
        self.estado = EstadoDaTransacaoImportada.PENDENTE
        self.motivo_ignorada = None

    def marcar_como_movimento_interno(self) -> None:
        """A pendente, ou a ignorada sem motivo, fica ignorada como movimento interno da conta."""
        if self.estado == EstadoDaTransacaoImportada.PENDENTE:
            self.ignorar(MotivoDaTransacaoIgnorada.MOVIMENTO_INTERNO_DA_CONTA)
        elif self.estado == EstadoDaTransacaoImportada.IGNORADA and self.motivo_ignorada is None:
            self.motivo_ignorada = MotivoDaTransacaoIgnorada.MOVIMENTO_INTERNO_DA_CONTA
        else:
            raise TransacaoJaTratada("Esta transação já foi tratada.")

    def exigir_pendente(self) -> None:
        """Recusa, antes de qualquer outra regra, a transação que já foi tratada."""
        if self.estado != EstadoDaTransacaoImportada.PENDENTE:
            raise TransacaoJaTratada("Esta transação já foi tratada.")

    def aceitar(self) -> None:
        self._tratar(EstadoDaTransacaoImportada.ACEITA)

    def ignorar(self, motivo: MotivoDaTransacaoIgnorada | None = None) -> None:
        try:
            motivo = MotivoDaTransacaoIgnorada(motivo) if motivo is not None else None
        except ValueError as erro:
            raise TransacaoImportadaInvalida("Motivo de descarte inválido.") from erro
        self._tratar(EstadoDaTransacaoImportada.IGNORADA)
        self.motivo_ignorada = motivo

    def _tratar(self, novo: EstadoDaTransacaoImportada) -> None:
        if self.estado != EstadoDaTransacaoImportada.PENDENTE:
            raise TransacaoJaTratada("Esta transação já foi tratada.")
        self.estado = novo

    def __eq__(self, outro: object) -> bool:
        if not isinstance(outro, TransacaoImportada):
            return NotImplemented
        return self.id == outro.id

    def __hash__(self) -> int:
        return hash(self.id)
