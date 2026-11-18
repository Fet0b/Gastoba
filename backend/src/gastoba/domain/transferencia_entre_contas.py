from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date
from uuid import UUID, uuid4

from gastoba.domain.conta import Conta, PapelDaConta, TipoDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import TransacaoImportadaInvalida
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)


@dataclass(slots=True)
class TransferenciaEntreContas:
    usuario_id: UUID
    conta_origem_id: UUID
    conta_destino_id: UUID
    valor: Dinheiro
    data: date
    papel_origem: PapelDaConta
    papel_destino: PapelDaConta
    transacao_origem_id: UUID | None = None
    transacao_destino_id: UUID | None = None
    competencia_provisoria: bool = False
    ativa: bool = True
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        if self.conta_origem_id == self.conta_destino_id or self.valor.centavos <= 0:
            raise TransacaoImportadaInvalida(
                "Transferência exige contas distintas e valor positivo."
            )
        if self.transacao_origem_id is None and self.transacao_destino_id is None:
            raise TransacaoImportadaInvalida("Identifique pelo menos uma ponta da transferência.")
        if self.transacao_origem_id == self.transacao_destino_id:
            raise TransacaoImportadaInvalida("A mesma transação não pode ser as duas pontas.")

    @property
    def aporte_liquido(self) -> Dinheiro:
        if not self.ativa or self.papel_origem == self.papel_destino:
            return Dinheiro(0)
        return (
            self.valor
            if self.papel_destino == PapelDaConta.INVESTIMENTO
            else Dinheiro(-self.valor.centavos)
        )

    @property
    def transacao_ids(self) -> tuple[UUID, ...]:
        return tuple(
            i for i in (self.transacao_origem_id, self.transacao_destino_id) if i is not None
        )


def criar_transferencia_pelas_pontas(
    usuario_id: UUID,
    conta: Conta,
    outra: Conta,
    t: TransacaoImportada,
    par: TransacaoImportada | None,
) -> TransferenciaEntreContas:
    if (
        conta.papel is None
        or outra.papel is None
        or conta.tipo == TipoDaConta.CARTAO
        or outra.tipo == TipoDaConta.CARTAO
    ):
        raise TransacaoImportadaInvalida(
            "Confirme o papel corrente ou investimento das duas contas."
        )
    if not conta.saldo_e_do_banco or not outra.saldo_e_do_banco:
        raise TransacaoImportadaInvalida("Este fluxo exige contas bancárias conectadas.")
    if par and (par.conta_id != outra.id or par.sentido == t.sentido or par.valor != t.valor):
        raise TransacaoImportadaInvalida(
            "O par deve ter valor igual, sentido oposto e a conta escolhida."
        )
    origem, destino = (conta, outra) if t.sentido == SentidoDaTransacao.SAIDA else (outra, conta)
    saida = t if t.sentido == SentidoDaTransacao.SAIDA else par
    entrada = t if t.sentido == SentidoDaTransacao.ENTRADA else par
    ponta_investimento = entrada if destino.papel.value == "investimento" else saida
    return TransferenciaEntreContas(
        usuario_id,
        origem.id,
        destino.id,
        t.valor,
        ponta_investimento.data if ponta_investimento else t.data,
        origem.papel,
        destino.papel,
        transacao_origem_id=saida.id if saida else None,
        transacao_destino_id=entrada.id if entrada else None,
        competencia_provisoria=ponta_investimento is None,
    )


# A saída e a entrada da mesma transferência podem cair em dias seguidos entre as instituições.
DIAS_DE_DIFERENCA = 1


def parear_transferencias(transacoes: Sequence[TransacaoImportada]) -> dict[UUID, UUID]:
    """Pares prováveis de transferência entre contas do mesmo dono: uma saída e uma entrada
    pendentes, de mesmo valor, em contas diferentes e com no máximo um dia de diferença.

    Só vale o par sem ambiguidade nos dois sentidos (a saída tem uma única entrada candidata e a
    entrada tem uma única saída candidata); com dúvida, não sugere. O resultado mapeia o id de
    cada ponta para o da outra.
    """
    pendentes = [t for t in transacoes if t.estado == EstadoDaTransacaoImportada.PENDENTE]
    saidas = [t for t in pendentes if t.sentido == SentidoDaTransacao.SAIDA]
    entradas = [t for t in pendentes if t.sentido == SentidoDaTransacao.ENTRADA]

    def candidatas(
        base: TransacaoImportada, outras: Sequence[TransacaoImportada]
    ) -> list[TransacaoImportada]:
        return [
            o
            for o in outras
            if o.conta_id != base.conta_id
            and o.valor == base.valor
            and abs((o.data - base.data).days) <= DIAS_DE_DIFERENCA
        ]

    pares: dict[UUID, UUID] = {}
    for saida in saidas:
        achadas = candidatas(saida, entradas)
        if len(achadas) != 1:
            continue
        entrada = achadas[0]
        if len(candidatas(entrada, saidas)) == 1:
            pares[saida.id] = entrada.id
            pares[entrada.id] = saida.id
    return pares
