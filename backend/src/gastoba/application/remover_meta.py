from uuid import UUID

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.portas import UnidadeDeTrabalho


class RemoverMeta:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, categoria: CategoriaDoGasto) -> None:
        """``MetaNaoEncontrada`` se o usuário não tem meta da categoria."""
        with self._unidade_de_trabalho as uow:
            uow.metas.remover(usuario_id, categoria)
            uow.commit()
