from gastoba.application.autenticacao import Autenticacao, MeioDeAutenticacao
from gastoba.domain.excecoes import NaoAutenticado
from gastoba.domain.portas import Relogio, UnidadeDeTrabalho
from gastoba.domain.segredo_de_acesso import SegredoDeAcesso, TipoDeSegredo


class AutenticarPorChaveDeApi:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho, relogio: Relogio) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._relogio = relogio

    def executar(self, token: str) -> Autenticacao:
        """Dono da chave ativa, com o escopo dela; ``NaoAutenticado`` em qualquer falha.

        Registra o uso da chave no máximo uma vez por minuto.
        """
        segredo = SegredoDeAcesso.de_texto(token)
        if segredo.tipo is not TipoDeSegredo.CHAVE_DE_API:
            raise NaoAutenticado()
        agora = self._relogio.agora()
        with self._unidade_de_trabalho as uow:
            chave = uow.chaves_de_api.obter_por_hash(segredo.hash_sha256)
            if (
                chave is None
                or chave.prefixo != segredo.prefixo_publico
                or not chave.esta_ativa(agora)
            ):
                raise NaoAutenticado()
            usuario = uow.usuarios.obter(chave.usuario_id)
            if usuario is None:
                raise NaoAutenticado()
            if chave.registrar_uso(agora):
                uow.chaves_de_api.registrar_uso(chave.id, agora)
                uow.commit()
            return Autenticacao(usuario, MeioDeAutenticacao.CHAVE_DE_API, chave.escopo)
