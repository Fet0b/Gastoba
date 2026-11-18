from uuid import UUID

from gastoba.domain.cor_da_destinacao import CorDaDestinacao
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.tag import Tag


class DefinirCorDaDestinacao:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, tag: str, cor: CorDaDestinacao) -> None:
        with self._unidade_de_trabalho as uow:
            uow.cores_das_destinacoes.definir(usuario_id, Tag.de_texto(tag), cor)
            uow.commit()
