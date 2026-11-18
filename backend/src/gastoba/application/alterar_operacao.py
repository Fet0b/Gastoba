from dataclasses import replace
from datetime import date
from decimal import Decimal
from uuid import UUID

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import OperacaoDaCorretoraImutavel, OperacaoNaoEncontrada
from gastoba.domain.operacao import Operacao
from gastoba.domain.portas import UnidadeDeTrabalho


class AlterarOperacao:
    """Edita data, quantidade, valor ou custos de uma operação manual ou da abertura. A da corretora
    é imutável, exceto a quantidade que ela omitiu (estimada pela posição). Editar a quantidade
    a confirma (deixa de ser estimada)."""

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        operacao_id: UUID,
        *,
        data: date | None = None,
        quantidade: Decimal | None = None,
        valor_bruto: Dinheiro | None = None,
        custos: Dinheiro | None = None,
    ) -> Operacao:
        with self._unidade_de_trabalho as uow:
            atual = uow.operacoes.obter(usuario_id, operacao_id)
            if atual is None:
                raise OperacaoNaoEncontrada("Operação não encontrada.")
            if atual.imutavel_pela_pessoa and not (
                atual.quantidade_estimada
                and (data is None or data == atual.data)
                and (valor_bruto is None or valor_bruto == atual.valor_bruto)
                and (custos is None or custos == atual.custos)
            ):
                # A da corretora só admite confirmar a quantidade que ela mesma omitiu.
                raise OperacaoDaCorretoraImutavel("A operação da corretora não pode ser alterada.")
            nova = replace(
                atual,
                data=data or atual.data,
                quantidade=atual.quantidade if quantidade is None else quantidade,
                valor_bruto=valor_bruto or atual.valor_bruto,
                custos=atual.custos if custos is None else custos,
                quantidade_estimada=False if quantidade is not None else atual.quantidade_estimada,
            )
            uow.operacoes.atualizar(usuario_id, nova)
            uow.commit()
            return nova
