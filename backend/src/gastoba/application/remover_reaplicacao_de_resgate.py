from uuid import UUID

from gastoba.domain.excecoes import ReaplicacaoNaoEncontrada
from gastoba.domain.portas import UnidadeDeTrabalho


class RemoverReaplicacaoDeResgate:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, id: UUID) -> None:
        with self._unidade_de_trabalho as uow:
            uow.reaplicacoes_de_resgates.bloquear(usuario_id)
            if uow.reaplicacoes_de_resgates.obter(usuario_id, id) is None:
                raise ReaplicacaoNaoEncontrada("Reaplicação não encontrada.")
            uow.reaplicacoes_de_resgates.remover(id)
            uow.commit()
