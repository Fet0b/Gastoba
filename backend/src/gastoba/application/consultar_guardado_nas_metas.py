from uuid import UUID

from gastoba.domain.caixinha_marcada import GuardadoNasMetas
from gastoba.domain.portas import UnidadeDeTrabalho


class ConsultarGuardadoNasMetas:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> GuardadoNasMetas:
        """A configuração da pessoa; sem ela, desligada. Só traz caixinhas que ainda existem."""
        with self._unidade_de_trabalho as uow:
            return uow.guardado_nas_metas.obter(usuario_id)
