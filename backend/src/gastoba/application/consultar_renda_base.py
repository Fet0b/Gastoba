from uuid import UUID

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.portas import UnidadeDeTrabalho


class ConsultarRendaBase:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> Dinheiro | None:
        with self._unidade_de_trabalho as uow:
            return uow.renda_base.obter(usuario_id)
