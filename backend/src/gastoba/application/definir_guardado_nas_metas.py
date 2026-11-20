from collections.abc import Sequence
from uuid import UUID

from gastoba.domain.caixinha_marcada import CaixinhaMarcada, GuardadoNasMetas
from gastoba.domain.excecoes import GuardadoInvalido
from gastoba.domain.portas import UnidadeDeTrabalho


class DefinirGuardadoNasMetas:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self, usuario_id: UUID, ativo: bool, marcacoes: Sequence[CaixinhaMarcada]
    ) -> GuardadoNasMetas:
        """Troca a configuração inteira. Cada caixinha precisa existir no cadastro da pessoa."""
        guardado = GuardadoNasMetas(ativo, tuple(marcacoes))
        with self._unidade_de_trabalho as uow:
            cadastradas = uow.guardado_nas_metas.tags_cadastradas(usuario_id)
            if any(m.tag not in cadastradas for m in guardado.marcacoes):
                raise GuardadoInvalido("Escolha só caixinhas que existem em Investimentos.")
            uow.guardado_nas_metas.salvar(usuario_id, guardado)
            uow.commit()
            return guardado
