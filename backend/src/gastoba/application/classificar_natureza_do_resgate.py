from uuid import UUID

from gastoba.domain.excecoes import MovimentoDeInvestimentoNaoEncontrado
from gastoba.domain.portas import UnidadeDeTrabalho


class ClassificarNaturezaDoResgate:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, movimento_id: UUID, vencimento: bool) -> None:
        with self._unidade_de_trabalho as uow:
            movimento = uow.movimentos_de_investimento.obter(usuario_id, movimento_id)
            if movimento is None:
                raise MovimentoDeInvestimentoNaoEncontrado("Movimento não encontrado.")
            movimento.classificar_vencimento(vencimento)
            uow.movimentos_de_investimento.gravar_natureza_do_resgate(movimento)
            uow.commit()
