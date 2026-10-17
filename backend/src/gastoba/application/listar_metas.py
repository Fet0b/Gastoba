from uuid import UUID

from gastoba.domain.meta import Meta
from gastoba.domain.portas import UnidadeDeTrabalho


class ListarMetas:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> list[Meta]:
        """Metas do usuário, na ordem das categorias."""
        with self._unidade_de_trabalho as uow:
            return uow.metas.listar(usuario_id)
