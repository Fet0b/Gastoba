from uuid import UUID

from gastoba.domain.excecoes import (
    OperacaoDaCorretoraImutavel,
    OperacaoInvalida,
    OperacaoNaoEncontrada,
)
from gastoba.domain.portas import UnidadeDeTrabalho


class ExcluirOperacao:
    """Exclui uma operação manual ou a abertura; as caixinhas pertencem à posição e não mudam.

    A da corretora não se exclui, e uma operação com taxa ou imposto ligado pede a remoção
    deles antes."""

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, operacao_id: UUID) -> None:
        with self._unidade_de_trabalho as uow:
            operacao = uow.operacoes.obter(usuario_id, operacao_id)
            if operacao is None:
                raise OperacaoNaoEncontrada("Operação não encontrada.")
            if operacao.imutavel_pela_pessoa:
                raise OperacaoDaCorretoraImutavel("A operação da corretora não pode ser excluída.")
            ligadas = [
                o
                for o in uow.operacoes.listar_da_posicao(usuario_id, operacao.posicao_id)
                if o.operacao_relacionada_id == operacao.id
            ]
            if ligadas:
                raise OperacaoInvalida(
                    "Remova antes as taxas e os impostos ligados a esta operação."
                )
            uow.operacoes.remover(usuario_id, operacao.id)
            uow.commit()
