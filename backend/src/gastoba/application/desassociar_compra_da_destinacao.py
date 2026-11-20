from uuid import UUID

from gastoba.domain.excecoes import CoberturaNaoEncontrada
from gastoba.domain.portas import UnidadeDeTrabalho


class DesassociarCompraDaDestinacao:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, gasto_id: UUID, cobertura_id: UUID) -> None:
        with self._unidade_de_trabalho as uow:
            cobertura = uow.coberturas.obter(usuario_id, cobertura_id)
            if cobertura is None or cobertura.gasto_id != gasto_id:
                raise CoberturaNaoEncontrada("Cobertura não encontrada.")
            uow.coberturas.remover(cobertura_id)
            uow.commit()
