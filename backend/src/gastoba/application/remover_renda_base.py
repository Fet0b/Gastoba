from uuid import UUID

from gastoba.domain.portas import UnidadeDeTrabalho


class RemoverRendaBase:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> None:
        with self._unidade_de_trabalho as uow:
            uow.renda_base.remover(usuario_id)
            uow.commit()
