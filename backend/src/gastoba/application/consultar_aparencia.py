from uuid import UUID

from gastoba.domain.aparencia import Aparencia
from gastoba.domain.portas import UnidadeDeTrabalho


class ConsultarAparencia:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> Aparencia:
        """A aparência salva da pessoa ou, sem ela, a padrão."""
        with self._unidade_de_trabalho as uow:
            return uow.aparencias.obter(usuario_id) or Aparencia.padrao()
