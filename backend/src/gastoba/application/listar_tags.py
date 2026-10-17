from uuid import UUID

from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.tag import Tag


class ListarTags:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> list[Tag]:
        """Tags distintas usadas nos gastos do usuário, em ordem crescente."""
        with self._unidade_de_trabalho as uow:
            return uow.gastos.listar_tags(usuario_id)
