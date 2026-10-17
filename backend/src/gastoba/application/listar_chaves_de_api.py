from uuid import UUID

from gastoba.domain.chave_de_api import ChaveDeApi
from gastoba.domain.portas import UnidadeDeTrabalho


class ListarChavesDeApi:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> list[ChaveDeApi]:
        """Chaves não revogadas do usuário, da mais nova para a mais antiga (sem segredo)."""
        with self._unidade_de_trabalho as uow:
            return uow.chaves_de_api.listar(usuario_id)
