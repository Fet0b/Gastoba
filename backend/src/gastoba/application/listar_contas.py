from uuid import UUID

from gastoba.domain.conta import Conta
from gastoba.domain.portas import UnidadeDeTrabalho


class ListarContas:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> list[Conta]:
        with self._unidade_de_trabalho as uow:
            return uow.contas.listar(usuario_id)
