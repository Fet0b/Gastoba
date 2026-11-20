from uuid import UUID

from gastoba.domain.historico_de_meta import HistoricoDeMeta
from gastoba.domain.portas import UnidadeDeTrabalho


class ListarHistoricoDeMetas:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> list[HistoricoDeMeta]:
        with self._unidade_de_trabalho as uow:
            return uow.historico_de_metas.listar(usuario_id)
