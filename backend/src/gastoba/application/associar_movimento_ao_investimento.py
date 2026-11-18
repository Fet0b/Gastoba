from collections.abc import Sequence
from uuid import UUID

from gastoba.application.destinar_movimento import preparar_destinacoes
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.excecoes import MovimentoDeInvestimentoNaoEncontrado, MovimentoJaAssociado
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento
from gastoba.domain.portas import UnidadeDeTrabalho


class AssociarMovimentoAoInvestimento:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        movimento_id: UUID,
        investimento_id: UUID,
        destinacoes: Sequence[Destinacao],
    ) -> MovimentoDeInvestimento:
        """Liga um aporte ou resgate ainda sem investimento a um investimento e às destinações."""
        with self._unidade_de_trabalho as uow:
            movimento = uow.movimentos_de_investimento.obter(usuario_id, movimento_id)
            if movimento is None:
                raise MovimentoDeInvestimentoNaoEncontrado("Movimento não encontrado.")
            if movimento.investimento_id is not None:
                raise MovimentoJaAssociado("Este movimento já está associado a um investimento.")
            partes = preparar_destinacoes(uow, usuario_id, movimento, investimento_id, destinacoes)
            uow.movimentos_de_investimento.associar(movimento.id, investimento_id)
            uow.destinacoes.adicionar(movimento.id, partes)
            uow.commit()
            return movimento
