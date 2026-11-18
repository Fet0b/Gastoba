"""Fatura do cartão de crédito: ciclo mensal, situação e estimativa pelas compras.

Só leitura: nada aqui mexe em saldo, gasto ou meta.
"""

import calendar
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum
from uuid import UUID

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ValorInvalido
from gastoba.domain.transacao_importada import EstadoDaTransacaoImportada, SentidoDaTransacao

_ZERO = Dinheiro(0)


class FonteDaFatura(StrEnum):
    BANCO = "banco"
    ESTIMADA = "estimada"


class SituacaoDaFatura(StrEnum):
    ABERTA = "aberta"
    FECHADA = "fechada"
    PAGA = "paga"
    VENCIDA = "vencida"


@dataclass(frozen=True, slots=True)
class PagamentoDeFatura:
    data: date
    valor: Dinheiro
    forma: str | None

    def __post_init__(self) -> None:
        if self.valor.centavos <= 0:
            raise ValorInvalido("O pagamento de uma fatura precisa ter valor positivo.")


@dataclass(frozen=True, slots=True)
class Fatura:
    id: UUID
    conta_id: UUID
    id_externo: str | None
    inicio: date | None
    fechamento: date
    vencimento: date | None
    total: Dinheiro
    minimo: Dinheiro | None
    pagamentos: tuple[PagamentoDeFatura, ...]
    fonte: FonteDaFatura

    def __post_init__(self) -> None:
        if self.total.centavos < 0:
            raise ValorInvalido("O total de uma fatura não pode ser negativo.")

    @property
    def pago(self) -> Dinheiro:
        return Dinheiro(sum(p.valor.centavos for p in self.pagamentos))

    @property
    def restante(self) -> Dinheiro:
        return Dinheiro(max(0, self.total.centavos - self.pago.centavos))

    @property
    def a_favor(self) -> Dinheiro:
        return Dinheiro(max(0, self.pago.centavos - self.total.centavos))

    def situacao(self, hoje: date) -> SituacaoDaFatura:
        if hoje <= self.fechamento:
            return SituacaoDaFatura.ABERTA
        if self.restante == _ZERO:
            return SituacaoDaFatura.PAGA
        if self.vencimento is not None and hoje > self.vencimento:
            return SituacaoDaFatura.VENCIDA
        return SituacaoDaFatura.FECHADA


@dataclass(frozen=True, slots=True)
class FaturaExterna:
    """Fatura como chega do provedor de Open Finance."""

    id_externo: str
    fechamento: date
    vencimento: date | None
    total: Dinheiro
    minimo: Dinheiro | None
    pagamentos: tuple[PagamentoDeFatura, ...]


@dataclass(frozen=True, slots=True)
class CompraDoCartao:
    """Transação de cartão, vista só pelo que importa ao ciclo da fatura."""

    id: UUID
    data: date
    valor: Dinheiro
    sentido: SentidoDaTransacao
    id_da_fatura: str | None = None
    descricao: str = ""
    parcela_numero: int | None = None
    parcela_total: int | None = None
    estado: EstadoDaTransacaoImportada = EstadoDaTransacaoImportada.PENDENTE


@dataclass(frozen=True, slots=True)
class FaturaEstimada:
    inicio: date
    fechamento: date
    vencimento: date
    total: Dinheiro
    pagamentos: tuple[PagamentoDeFatura, ...]


def _fechamento_do_mes(ano: int, mes: int, dia: int) -> date:
    return date(ano, mes, min(dia, calendar.monthrange(ano, mes)[1]))


def _mes_seguinte(ano: int, mes: int) -> tuple[int, int]:
    return (ano + 1, 1) if mes == 12 else (ano, mes + 1)


def _fechamento_que_cobre(dia: int, data: date) -> date:
    """Menor fechamento mensal (no ``dia``) que seja maior ou igual a ``data``."""
    candidato = _fechamento_do_mes(data.year, data.month, dia)
    if candidato >= data:
        return candidato
    ano, mes = _mes_seguinte(data.year, data.month)
    return _fechamento_do_mes(ano, mes, dia)


def estimar_faturas(
    fechamento_de_referencia: date,
    vencimento_de_referencia: date,
    compras: Sequence[CompraDoCartao],
    pagamentos: Sequence[PagamentoDeFatura],
    hoje: date,
) -> list[FaturaEstimada]:
    """Reconstrói as faturas pelas compras, do ciclo da compra mais antiga até o de ``hoje``."""
    dia = fechamento_de_referencia.day
    intervalo = vencimento_de_referencia - fechamento_de_referencia
    ultimo = _fechamento_que_cobre(dia, hoje)
    primeiro = _fechamento_que_cobre(dia, min(c.data for c in compras)) if compras else ultimo
    primeiro = min(primeiro, ultimo)

    fechamentos: list[date] = []
    ano, mes = primeiro.year, primeiro.month
    while True:
        fechamento = _fechamento_do_mes(ano, mes, dia)
        fechamentos.append(fechamento)
        if fechamento >= ultimo:
            break
        ano, mes = _mes_seguinte(ano, mes)

    anterior_ao_primeiro = (
        _fechamento_do_mes(primeiro.year - 1, 12, dia)
        if primeiro.month == 1
        else _fechamento_do_mes(primeiro.year, primeiro.month - 1, dia)
    )
    limites = [anterior_ao_primeiro, *fechamentos]

    faturas: list[FaturaEstimada] = []
    for indice, fechamento in enumerate(fechamentos):
        anterior = limites[indice]
        centavos = 0
        for compra in compras:
            if anterior < compra.data <= fechamento:
                if compra.sentido is SentidoDaTransacao.SAIDA:
                    centavos += compra.valor.centavos
                else:
                    centavos -= compra.valor.centavos
        faturas.append(
            FaturaEstimada(
                inicio=anterior + timedelta(days=1),
                fechamento=fechamento,
                vencimento=fechamento + intervalo,
                total=Dinheiro(max(0, centavos)),
                pagamentos=(),
            )
        )

    por_indice: dict[int, list[PagamentoDeFatura]] = {}
    for pagamento in pagamentos:
        destino = None
        for indice, fatura in enumerate(faturas):
            if fatura.fechamento < pagamento.data:
                destino = indice
        if destino is not None:
            por_indice.setdefault(destino, []).append(pagamento)
    return [
        FaturaEstimada(
            inicio=f.inicio,
            fechamento=f.fechamento,
            vencimento=f.vencimento,
            total=f.total,
            pagamentos=tuple(por_indice.get(i, ())),
        )
        for i, f in enumerate(faturas)
    ]


def atribuir_ciclo(compra: CompraDoCartao, faturas: Sequence[Fatura]) -> UUID | None:
    """Fatura da compra: ``billId`` do banco, senão a janela (fechamento anterior, fechamento]."""
    if compra.id_da_fatura is not None:
        for fatura in faturas:
            if fatura.id_externo == compra.id_da_fatura:
                return fatura.id
    ordenadas = sorted(faturas, key=lambda f: f.fechamento)
    for indice, fatura in enumerate(ordenadas):
        if indice > 0:
            piso: date | None = ordenadas[indice - 1].fechamento
        elif fatura.inicio is not None:
            piso = fatura.inicio - timedelta(days=1)
        else:
            piso = None
        if piso is not None and piso < compra.data <= fatura.fechamento:
            return fatura.id
    return None
