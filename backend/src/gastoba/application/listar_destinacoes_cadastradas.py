from uuid import UUID

from gastoba.domain.destinacao_cadastrada import DestinacaoCadastrada
from gastoba.domain.portas import UnidadeDeTrabalho


class ListarDestinacoesCadastradas:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> list[DestinacaoCadastrada]:
        with self._unidade_de_trabalho as uow:
            return uow.destinacoes_cadastradas.listar(usuario_id)
