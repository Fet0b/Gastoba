from gastoba.application.autenticacao import Autenticacao, MeioDeAutenticacao
from gastoba.domain.excecoes import NaoAutenticado
from gastoba.domain.portas import Relogio, UnidadeDeTrabalho
from gastoba.domain.segredo_de_acesso import SegredoDeAcesso, TipoDeSegredo


class AutenticarPorSessao:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho, relogio: Relogio) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._relogio = relogio

    def executar(self, token: str) -> Autenticacao:
        """Usuário dono da sessão ativa; ``NaoAutenticado``, sempre igual, em qualquer falha."""
        segredo = SegredoDeAcesso.de_texto(token)
        if segredo.tipo is not TipoDeSegredo.SESSAO:
            raise NaoAutenticado()
        with self._unidade_de_trabalho as uow:
            sessao = uow.sessoes.obter_por_hash(segredo.hash_sha256)
            if sessao is None or not sessao.esta_ativa(self._relogio.agora()):
                raise NaoAutenticado()
            usuario = uow.usuarios.obter(sessao.usuario_id)
            if usuario is None:
                raise NaoAutenticado()
            return Autenticacao(usuario, MeioDeAutenticacao.SESSAO)
