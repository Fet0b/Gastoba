from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.usuario import ID_USUARIO_PADRAO, Usuario


class ObterUsuarioPadrao:
    """Devolve o usuário padrão, criando-o no primeiro uso (enquanto não existe login)."""

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho, nome_padrao: str) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._nome_padrao = nome_padrao

    def executar(self) -> Usuario:
        with self._unidade_de_trabalho as uow:
            existente = uow.usuarios.obter(ID_USUARIO_PADRAO)
            if existente is not None:
                return existente
            usuario = Usuario(self._nome_padrao, id=ID_USUARIO_PADRAO)
            uow.usuarios.garantir(usuario)
            uow.commit()
            return usuario
