from uuid import UUID

from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.recorrencia import Recorrencia


class ListarRecorrencias:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> list[Recorrencia]:
        """Recorrências do usuário, ativas e encerradas."""
        with self._unidade_de_trabalho as uow:
            return uow.recorrencias.listar(usuario_id)
