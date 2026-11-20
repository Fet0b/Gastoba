from uuid import UUID

from gastoba.domain.excecoes import PercentuaisExcedem100
from gastoba.domain.historico_de_meta import AcaoDoHistoricoDeMeta, HistoricoDeMeta
from gastoba.domain.meta import AlvoDaMeta, Meta
from gastoba.domain.portas import Relogio, UnidadeDeTrabalho


class DefinirMeta:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho, relogio: Relogio) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._relogio = relogio

    def executar(self, usuario_id: UUID, alvo: AlvoDaMeta, percentual: int) -> Meta:
        """Cria a meta do alvo ou troca o percentual; a soma das metas não passa de 100%."""
        with self._unidade_de_trabalho as uow:
            uow.metas.bloquear(usuario_id)
            meta = Meta(usuario_id=usuario_id, alvo=alvo, percentual=percentual)
            outras = sum(m.percentual for m in uow.metas.listar(usuario_id) if m.alvo != alvo)
            if outras + meta.percentual > 100:
                raise PercentuaisExcedem100(
                    f"As metas somariam {outras + meta.percentual}% da renda; o máximo é 100%."
                )
            anterior = uow.metas.obter(usuario_id, alvo)
            if anterior is not None and anterior.percentual == percentual:
                return anterior
            uow.metas.salvar(meta)
            uow.historico_de_metas.registrar(
                HistoricoDeMeta(
                    usuario_id,
                    alvo,
                    anterior.percentual if anterior else None,
                    percentual,
                    AcaoDoHistoricoDeMeta.ALTERADA if anterior else AcaoDoHistoricoDeMeta.CRIADA,
                    self._relogio.agora(),
                )
            )
            uow.commit()
            return meta
