from uuid import UUID

from gastoba.application.realocar_destinacao import realocacao_da_mudanca
from gastoba.domain.excecoes import InvestimentoNaoEncontrado
from gastoba.domain.investimento import Realocacao
from gastoba.domain.portas import UnidadeDeTrabalho


class ListarRealocacoes:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, investimento_id: UUID) -> list[Realocacao]:
        """As realocações do investimento (as da fração e as antigas, do principal), da mais
        recente para a mais antiga."""
        with self._unidade_de_trabalho as uow:
            if uow.investimentos.obter(usuario_id, investimento_id) is None:
                raise InvestimentoNaoEncontrado("Investimento não encontrado.")
            da_fracao = [
                realocacao_da_mudanca(m)
                for m in uow.mudancas_de_fracao.listar_da_posicao(usuario_id, investimento_id)
                if m.origem is not None
            ]
            antigas = uow.destinacoes.listar_realocacoes(usuario_id, investimento_id)
            return sorted(da_fracao + antigas, key=lambda r: r.data, reverse=True)
