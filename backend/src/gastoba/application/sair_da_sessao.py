from gastoba.domain.excecoes import NaoAutenticado
from gastoba.domain.portas import Relogio, UnidadeDeTrabalho
from gastoba.domain.segredo_de_acesso import SegredoDeAcesso, TipoDeSegredo


class SairDaSessao:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho, relogio: Relogio) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._relogio = relogio

    def executar(self, token: str) -> None:
        """Revoga a sessão; ``NaoAutenticado`` se ela já não estiver ativa (sair duas vezes)."""
        segredo = SegredoDeAcesso.de_texto(token)
        if segredo.tipo is not TipoDeSegredo.SESSAO:
            raise NaoAutenticado()
        with self._unidade_de_trabalho as uow:
            sessao = uow.sessoes.obter_por_hash(segredo.hash_sha256)
            if sessao is None or not sessao.esta_ativa(self._relogio.agora()):
                raise NaoAutenticado()
            uow.sessoes.revogar(sessao.id)
            uow.commit()
