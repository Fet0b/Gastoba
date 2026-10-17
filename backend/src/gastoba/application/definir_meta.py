from uuid import UUID

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.excecoes import PercentuaisExcedem100
from gastoba.domain.meta import Meta
from gastoba.domain.portas import UnidadeDeTrabalho


class DefinirMeta:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, categoria: CategoriaDoGasto, percentual: int) -> Meta:
        """Cria a meta da categoria ou troca o percentual; a soma das metas não passa de 100%."""
        with self._unidade_de_trabalho as uow:
            meta = Meta(usuario_id=usuario_id, categoria=categoria, percentual=percentual)
            outras = sum(
                m.percentual for m in uow.metas.listar(usuario_id) if m.categoria != categoria
            )
            if outras + meta.percentual > 100:
                raise PercentuaisExcedem100(
                    f"As metas somariam {outras + meta.percentual}% da renda; o máximo é 100%."
                )
            uow.metas.salvar(meta)
            uow.commit()
            return meta
