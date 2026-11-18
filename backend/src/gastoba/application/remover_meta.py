from uuid import UUID

from gastoba.domain.historico_de_meta import AcaoDoHistoricoDeMeta, HistoricoDeMeta
from gastoba.domain.meta import AlvoDaMeta
from gastoba.domain.portas import Relogio, UnidadeDeTrabalho


class RemoverMeta:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho, relogio: Relogio) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._relogio = relogio

    def executar(self, usuario_id: UUID, alvo: AlvoDaMeta) -> None:
        """``MetaNaoEncontrada`` se o usuário não tem meta da alvo."""
        with self._unidade_de_trabalho as uow:
            uow.metas.bloquear(usuario_id)
            anterior = uow.metas.obter(usuario_id, alvo)
            uow.metas.remover(usuario_id, alvo)
            uow.historico_de_metas.registrar(
                HistoricoDeMeta(
                    usuario_id,
                    alvo,
                    anterior.percentual,
                    None,
                    AcaoDoHistoricoDeMeta.REMOVIDA,
                    self._relogio.agora(),
                )
            )
            uow.commit()
