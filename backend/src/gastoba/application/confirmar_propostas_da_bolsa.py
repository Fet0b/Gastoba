from collections.abc import Sequence
from dataclasses import dataclass
from uuid import UUID

from gastoba.application.desfazer_classificacao_importada import desfazer_sem_confirmar
from gastoba.application.listar_revisao_da_bolsa import PropostaListada, montar_revisao
from gastoba.domain.casamento_de_liquidacao import Tolerancia, montar_casamento_de_bolsa
from gastoba.domain.casamento_de_operacao import CasamentoDeOperacao
from gastoba.domain.casamento_de_resgate_de_renda_fixa import montar_casamento_de_renda_fixa
from gastoba.domain.excecoes import CasamentoAmbiguo, RevisaoDesatualizada
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    OrigemDoMovimento,
    TipoDeMovimento,
)
from gastoba.domain.operacao import TipoDeOperacao
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.revisao_da_bolsa import EXATA, OperacaoNaRevisao, SituacaoDaTransacao
from gastoba.domain.transacao_importada import EstadoDaTransacaoImportada

_A_DESFAZER = (
    SituacaoDaTransacao.APORTE_SEM_INVESTIMENTO,
    SituacaoDaTransacao.RESGATE_SEM_INVESTIMENTO,
    SituacaoDaTransacao.GANHO,
    SituacaoDaTransacao.APORTE_DE_OUTRA_POSICAO,
)


@dataclass(frozen=True, slots=True)
class ItemDeConfirmacao:
    chave: str
    versao: str
    # Só lido quando a proposta ``precisa_escolher``: as operações que a pessoa escolheu.
    operacao_ids: tuple[UUID, ...] = ()


@dataclass(frozen=True, slots=True)
class LigacaoConfirmada:
    casamento_id: UUID
    chave: str


class ConfirmarPropostasDaBolsa:
    """Liga as propostas que a pessoa confirmou, numa só unidade de trabalho (tudo ou nada).

    Para cada proposta: o lançamento antigo sai (com a reversão registrada), o casamento é gravado,
    as transações são aceitas e nasce **um aporte (compra) ou resgate (venda ou vencimento) por
    operação**, ligado à posição e sem destinações. Taxa e imposto não geram movimento. Saldo de
    conta, destinações, alocações e custo das operações não são tocados."""

    def __init__(
        self, unidade_de_trabalho: UnidadeDeTrabalho, tolerancia: Tolerancia | None = None
    ) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._tolerancia = tolerancia or Tolerancia()

    def executar(
        self, usuario_id: UUID, itens: Sequence[ItemDeConfirmacao]
    ) -> list[LigacaoConfirmada]:
        with self._unidade_de_trabalho as uow:
            resultado = self.confirmar_na_unidade(uow, usuario_id, itens)
            uow.commit()
            return resultado

    def confirmar_na_unidade(
        self, uow, usuario_id: UUID, itens: Sequence[ItemDeConfirmacao]
    ) -> list[LigacaoConfirmada]:
        """Igual a ``executar`` sem o ``commit``: serve para compor com outra escrita."""
        revisao = montar_revisao(uow, usuario_id, self._tolerancia)
        por_chave = {p.proposta.chave: p for p in revisao.propostas}
        escolhidas = [self._validar(item, por_chave) for item in itens]
        self._sem_conflito(escolhidas)
        resultado = []
        for item, listada, operacoes in escolhidas:
            casamento = self._ligar(uow, usuario_id, listada, operacoes)
            resultado.append(LigacaoConfirmada(casamento.id, item.chave))
        return resultado

    @staticmethod
    def _validar(item, por_chave) -> tuple[ItemDeConfirmacao, PropostaListada, list]:
        listada = por_chave.get(item.chave)
        if listada is None or listada.versao != item.versao:
            raise RevisaoDesatualizada("A revisão mudou desde que você a abriu. Confira de novo.")
        proposta = listada.proposta
        if proposta.confianca == EXATA:
            return item, listada, list(proposta.operacoes)
        candidatas = {o.operacao.id: o for o in proposta.operacoes}
        if not item.operacao_ids or len(set(item.operacao_ids)) != len(item.operacao_ids):
            raise CasamentoAmbiguo("Escolha as operações desta ligação.")
        if any(i not in candidatas for i in item.operacao_ids):
            raise CasamentoAmbiguo("A escolha não está entre as operações da proposta.")
        return item, listada, [candidatas[i] for i in item.operacao_ids]

    @staticmethod
    def _sem_conflito(escolhidas) -> None:
        operacoes: set[UUID] = set()
        transacoes: set[UUID] = set()
        for _, listada, ops in escolhidas:
            ids_o = {o.operacao.id for o in ops}
            ids_t = {t.transacao.id for t in (*listada.proposta.bruto, *listada.proposta.taxas)}
            if ids_o & operacoes or ids_t & transacoes:
                raise CasamentoAmbiguo("Duas ligações escolhidas usam o mesmo lançamento.")
            operacoes |= ids_o
            transacoes |= ids_t

    def _ligar(
        self, uow, usuario_id: UUID, listada: PropostaListada, operacoes: list[OperacaoNaRevisao]
    ) -> CasamentoDeOperacao:
        proposta = listada.proposta
        todas = [*proposta.bruto, *proposta.taxas]
        for t in todas:
            if t.situacao in _A_DESFAZER:
                desfazer_sem_confirmar(uow, usuario_id, t.transacao.id, confirmar=False)
        brutos = [
            uow.transacoes_importadas.obter(usuario_id, t.transacao.id) for t in proposta.bruto
        ]
        taxas = [
            uow.transacoes_importadas.obter(usuario_id, t.transacao.id) for t in proposta.taxas
        ]
        ops = [o.operacao for o in operacoes]
        if proposta.tipo == "resgate_de_renda_fixa":
            casamento = montar_casamento_de_renda_fixa(
                ops[0], brutos, taxas[0] if taxas else None, self._tolerancia
            )
        else:
            casamento = montar_casamento_de_bolsa(ops, [*brutos, *taxas], self._tolerancia)
        uow.casamentos.adicionar(usuario_id, casamento)
        for transacao in (*brutos, *taxas):
            if transacao.estado == EstadoDaTransacaoImportada.PENDENTE:
                transacao.aceitar()
                uow.transacoes_importadas.atualizar_estado(transacao)
        referencia = brutos[0]
        for operacao in ops:
            tipo = (
                TipoDeMovimento.APORTE
                if operacao.tipo == TipoDeOperacao.COMPRA
                else TipoDeMovimento.RESGATE
            )
            uow.movimentos_de_investimento.adicionar(
                MovimentoDeInvestimento(
                    conta_id=referencia.conta_id,
                    tipo=tipo,
                    valor=operacao.valor_bruto,
                    descricao=referencia.descricao,
                    data=referencia.data,
                    investimento_id=operacao.posicao_id,
                    origem=OrigemDoMovimento.OPEN_FINANCE,
                    transacao_importada_id=referencia.id,
                )
            )
        return casamento
