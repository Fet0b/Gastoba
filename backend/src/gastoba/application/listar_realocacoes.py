from uuid import UUID

from gastoba.domain.excecoes import InvestimentoNaoEncontrado
from gastoba.domain.investimento import Realocacao
from gastoba.domain.portas import UnidadeDeTrabalho


class ListarRealocacoes:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, investimento_id: UUID) -> list[Realocacao]:
        """As realocações do investimento, da mais recente para a mais antiga."""
        with self._unidade_de_trabalho as uow:
            if uow.investimentos.obter(usuario_id, investimento_id) is None:
                raise InvestimentoNaoEncontrado("Investimento não encontrado.")
            return uow.destinacoes.listar_realocacoes(usuario_id, investimento_id)
