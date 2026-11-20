from uuid import UUID

from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.reaplicacao_de_resgate import ReaplicacaoDeResgate


class ListarReaplicacoesDeResgates:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> list[ReaplicacaoDeResgate]:
        with self._unidade_de_trabalho as uow:
            return uow.reaplicacoes_de_resgates.listar(usuario_id)
