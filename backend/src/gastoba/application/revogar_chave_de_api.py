from uuid import UUID

from gastoba.domain.excecoes import ChaveDeApiNaoEncontrada
from gastoba.domain.portas import UnidadeDeTrabalho


class RevogarChaveDeApi:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, chave_id: UUID) -> None:
        """Revoga a chave; ``ChaveDeApiNaoEncontrada`` se for de outro usuário ou já revogada."""
        with self._unidade_de_trabalho as uow:
            chave = uow.chaves_de_api.obter(usuario_id, chave_id)
            if chave is None or chave.revogada:
                raise ChaveDeApiNaoEncontrada("Chave de API não encontrada.")
            uow.chaves_de_api.revogar(chave.id)
            uow.commit()
