from uuid import UUID

from gastoba.domain.portas import UnidadeDeTrabalho


class RestaurarAparencia:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> None:
        """Volta à aparência padrão; idempotente."""
        with self._unidade_de_trabalho as uow:
            uow.aparencias.remover(usuario_id)
            uow.commit()
