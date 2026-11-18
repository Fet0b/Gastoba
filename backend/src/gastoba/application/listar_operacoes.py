from uuid import UUID

from gastoba.domain.excecoes import InvestimentoNaoEncontrado
from gastoba.domain.operacao import Operacao
from gastoba.domain.portas import UnidadeDeTrabalho


class ListarOperacoes:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, investimento_id: UUID) -> list[Operacao]:
        """As operações da posição, da mais antiga para a mais recente."""
        with self._unidade_de_trabalho as uow:
            if uow.investimentos.obter(usuario_id, investimento_id) is None:
                raise InvestimentoNaoEncontrado("Investimento não encontrado.")
            return uow.operacoes.listar_da_posicao(usuario_id, investimento_id)
