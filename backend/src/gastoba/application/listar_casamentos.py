from uuid import UUID

from gastoba.domain.casamento_de_operacao import CasamentoDeOperacao
from gastoba.domain.portas import UnidadeDeTrabalho


class ListarCasamentos:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho):
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> list[CasamentoDeOperacao]:
        with self._unidade_de_trabalho as uow:
            return uow.casamentos.listar(usuario_id)
