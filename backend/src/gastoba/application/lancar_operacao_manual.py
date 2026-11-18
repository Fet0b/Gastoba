from datetime import date
from decimal import Decimal
from uuid import UUID

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    InvestimentoNaoEncontrado,
    OperacaoInvalida,
    OperacaoPossivelmenteDuplicada,
)
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.portas import UnidadeDeTrabalho


class LancarOperacaoManual:
    """Completa o histórico à mão (compra, venda, provento, taxa, imposto ou vencimento).

    Se já existe uma operação da corretora igual (mesmo tipo, dia, valor e quantidade), recusa por
    possível duplicidade em vez de somar as duas; a pessoa pode confirmar que é outra operação.
    """

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        investimento_id: UUID,
        tipo: TipoDeOperacao,
        data: date,
        quantidade: Decimal,
        valor_bruto: Dinheiro,
        *,
        custos: Dinheiro | None = None,
        operacao_relacionada_id: UUID | None = None,
        confirmar_duplicidade: bool = False,
    ) -> Operacao:
        if tipo == TipoDeOperacao.ABERTURA:
            raise OperacaoInvalida("A abertura é criada pela migração; edite a existente.")
        with self._unidade_de_trabalho as uow:
            if uow.investimentos.obter(usuario_id, investimento_id) is None:
                raise InvestimentoNaoEncontrado("Investimento não encontrado.")
            existentes = uow.operacoes.listar_da_posicao(usuario_id, investimento_id)
            if operacao_relacionada_id is not None and all(
                o.id != operacao_relacionada_id for o in existentes
            ):
                raise OperacaoInvalida("A operação relacionada não é desta posição.")
            operacao = Operacao(
                posicao_id=investimento_id,
                tipo=tipo,
                data=data,
                quantidade=quantidade,
                valor_bruto=valor_bruto,
                custos=custos or Dinheiro(0),
                origem=OrigemDaOperacao.MANUAL,
                operacao_relacionada_id=operacao_relacionada_id,
            )
            if not confirmar_duplicidade and any(
                o.origem == OrigemDaOperacao.PLUGGY
                and o.tipo == tipo
                and o.data == data
                and o.quantidade == quantidade
                and o.valor_bruto == valor_bruto
                for o in existentes
            ):
                raise OperacaoPossivelmenteDuplicada(
                    "Já existe uma operação igual vinda da corretora. Confirme se é outra operação."
                )
            uow.operacoes.adicionar(usuario_id, operacao)
            uow.commit()
            return operacao
