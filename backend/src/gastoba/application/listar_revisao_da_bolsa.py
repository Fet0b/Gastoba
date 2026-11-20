import hashlib
import json
from dataclasses import dataclass
from uuid import UUID

from gastoba.application.consultar_impacto_da_reversao import impacto_do_grupo
from gastoba.domain.casamento_de_liquidacao import (
    Tolerancia,
    e_liquidacao_bruta,
    e_taxa_de_liquidacao,
)
from gastoba.domain.casamento_de_operacao import CasamentoDeOperacao, PapelDoVinculo
from gastoba.domain.movimento_de_investimento import TipoDeMovimento
from gastoba.domain.operacao import OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.operacao_da_corretora import RENDA_FIXA
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.revisao_da_bolsa import (
    ItemConciliado,
    ItemSemPar,
    OperacaoNaRevisao,
    PropostaDeCasamento,
    SituacaoDaTransacao,
    TransacaoNaRevisao,
    propor_casamentos,
)
from gastoba.domain.transacao_importada import EstadoDaTransacaoImportada, TransacaoImportada

_TIPOS = (TipoDeOperacao.COMPRA, TipoDeOperacao.VENDA, TipoDeOperacao.VENCIMENTO)


@dataclass(frozen=True, slots=True)
class PropostaListada:
    proposta: PropostaDeCasamento
    # Muda quando muda o estado de qualquer transação ou lançamento da proposta.
    versao: str


@dataclass(frozen=True, slots=True)
class CasamentoConfirmado:
    casamento: CasamentoDeOperacao
    # Ligação antiga: o casamento existe, mas nenhum aporte/resgate foi registrado por ele.
    sem_aporte: bool


@dataclass(frozen=True, slots=True)
class RevisaoDaBolsa:
    propostas: tuple[PropostaListada, ...]
    sem_par: tuple[ItemSemPar, ...]
    confirmados: tuple[CasamentoConfirmado, ...]
    conciliadas: tuple[ItemConciliado, ...] = ()


def situacao_da_transacao(
    uow, usuario_id: UUID, transacao: TransacaoImportada, casadas: set[UUID]
) -> SituacaoDaTransacao:
    if transacao.id in casadas:
        return SituacaoDaTransacao.CASADA
    if transacao.estado == EstadoDaTransacaoImportada.PENDENTE:
        return SituacaoDaTransacao.PENDENTE
    if transacao.estado == EstadoDaTransacaoImportada.IGNORADA:
        return SituacaoDaTransacao.IGNORADA
    gastos = uow.gastos.da_transacao(usuario_id, transacao.id)
    ganhos = uow.ganhos.da_transacao(usuario_id, transacao.id)
    movimentos = uow.movimentos_de_investimento.da_transacao(usuario_id, transacao.id)
    # Parte de divisão, transferência ou sem lançamento: não se liga sem desfazer antes.
    if len(gastos) + len(ganhos) + len(movimentos) != 1 or uow.transferencias.da_transacao(
        usuario_id, transacao.id
    ):
        return SituacaoDaTransacao.DIVIDIDA
    if gastos:
        return SituacaoDaTransacao.ACEITA_COMO_GASTO
    if ganhos:
        return SituacaoDaTransacao.GANHO
    (movimento,) = movimentos
    if movimento.investimento_id is not None:
        return SituacaoDaTransacao.APORTE_DE_OUTRA_POSICAO
    if movimento.tipo == TipoDeMovimento.APORTE:
        return SituacaoDaTransacao.APORTE_SEM_INVESTIMENTO
    return SituacaoDaTransacao.RESGATE_SEM_INVESTIMENTO


def _versao(uow, usuario_id: UUID, proposta: PropostaDeCasamento) -> str:
    partes = [proposta.chave]
    for t in sorted((*proposta.bruto, *proposta.taxas), key=lambda t: str(t.transacao.id)):
        grupo = [
            *uow.gastos.da_transacao(usuario_id, t.transacao.id),
            *uow.ganhos.da_transacao(usuario_id, t.transacao.id),
            *uow.movimentos_de_investimento.da_transacao(usuario_id, t.transacao.id),
        ]
        partes.append(t.situacao.value)
        partes.append(impacto_do_grupo(uow, usuario_id, t.transacao, grupo).versao)
    return hashlib.sha256("|".join(partes).encode()).hexdigest()


def montar_revisao(uow, usuario_id: UUID, tolerancia: Tolerancia) -> RevisaoDaBolsa:
    codigos = {}
    for externo in uow.investimentos.listar(usuario_id):
        try:
            codigos[externo.id_externo] = json.loads(externo.dados or "{}").get("code")
        except ValueError:
            codigos[externo.id_externo] = None
    operacoes = []
    for posicao in uow.investimentos.listar_posicoes(usuario_id):
        for operacao in uow.operacoes.listar_da_posicao(usuario_id, posicao.id):
            if (
                operacao.origem != OrigemDaOperacao.PLUGGY
                or operacao.tipo not in _TIPOS
                or uow.casamentos.para_operacao(usuario_id, operacao.id) is not None
            ):
                continue
            code = codigos.get(posicao.id_externo)
            operacoes.append(
                OperacaoNaRevisao(
                    operacao,
                    posicao.nome,
                    code if isinstance(code, str) else None,
                    posicao.tipo == RENDA_FIXA,
                )
            )
    casadas = uow.casamentos.transacoes_casadas(usuario_id)
    candidatas = [
        *uow.transacoes_importadas.listar(usuario_id, EstadoDaTransacaoImportada.PENDENTE),
        *uow.transacoes_importadas.listar(usuario_id, EstadoDaTransacaoImportada.ACEITA),
    ]
    transacoes = []
    for t in candidatas:
        pendente_de_bolsa = t.estado == EstadoDaTransacaoImportada.PENDENTE and (
            e_liquidacao_bruta(t.descricao) or e_taxa_de_liquidacao(t.descricao)
        )
        perto = any(abs((t.data - o.operacao.data).days) <= tolerancia.dias for o in operacoes)
        if perto or pendente_de_bolsa:
            situacao = situacao_da_transacao(uow, usuario_id, t, casadas)
            posicao_id = None
            if situacao == SituacaoDaTransacao.APORTE_DE_OUTRA_POSICAO:
                (movimento,) = uow.movimentos_de_investimento.da_transacao(usuario_id, t.id)
                posicao_id = movimento.investimento_id
            transacoes.append(TransacaoNaRevisao(t, situacao, posicao_id))
    resultado = propor_casamentos(operacoes, transacoes, tolerancia)
    propostas = tuple(PropostaListada(p, _versao(uow, usuario_id, p)) for p in resultado.propostas)
    confirmados = []
    for casamento in uow.casamentos.listar(usuario_id):
        brutos = [v for v in casamento.vinculos if v.papel == PapelDoVinculo.BRUTO]
        sem_aporte = not any(
            uow.movimentos_de_investimento.da_transacao(usuario_id, v.transacao_importada_id)
            for v in brutos
        )
        confirmados.append(CasamentoConfirmado(casamento, sem_aporte))
    return RevisaoDaBolsa(propostas, resultado.sem_par, tuple(confirmados), resultado.conciliadas)


class ListarRevisaoDaBolsa:
    def __init__(
        self, unidade_de_trabalho: UnidadeDeTrabalho, tolerancia: Tolerancia | None = None
    ) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._tolerancia = tolerancia or Tolerancia()

    def executar(self, usuario_id: UUID) -> RevisaoDaBolsa:
        with self._unidade_de_trabalho as uow:
            return montar_revisao(uow, usuario_id, self._tolerancia)
