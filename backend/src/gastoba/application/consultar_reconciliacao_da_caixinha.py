from uuid import UUID

from gastoba.domain.caixinha import (
    TIPO_DA_CAIXINHA,
    ReconciliacaoDaCaixinha,
    reconciliar_extrato_mensal,
)
from gastoba.domain.excecoes import InvestimentoNaoEncontrado, TransacaoImportadaInvalida
from gastoba.domain.mes import Mes
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.transacao_importada import EstadoDaTransacaoImportada


class ConsultarReconciliacaoDaCaixinha:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self, usuario_id: UUID, investimento_id: UUID, mes: Mes
    ) -> ReconciliacaoDaCaixinha:
        with self._unidade_de_trabalho as uow:
            inv = uow.investimentos.obter(usuario_id, investimento_id)
            if inv is None:
                raise InvestimentoNaoEncontrado("Investimento não encontrado.")
            referencia = uow.investimentos.referencia_da_caixinha(investimento_id, mes)
            if inv.tipo != TIPO_DA_CAIXINHA or referencia is None:
                raise TransacaoImportadaInvalida(
                    "Informe os saldos inicial e final do extrato mensal da caixinha."
                )
            movimentos = [
                m
                for m in uow.movimentos_de_investimento.listar(usuario_id, mes.inicio, mes.fim)
                if m.investimento_id == investimento_id
            ]
            pendentes = uow.transacoes_importadas.listar(
                usuario_id, EstadoDaTransacaoImportada.PENDENTE
            )
            tem_pendente = any(
                inv.conta_remunerada_id == t.conta_id and mes.inicio <= t.data <= mes.fim
                for t in pendentes
            )
            return reconciliar_extrato_mensal(
                referencia.saldo_inicial,
                referencia.saldo_final,
                movimentos,
                referencia.periodo_completo and not tem_pendente,
            )
