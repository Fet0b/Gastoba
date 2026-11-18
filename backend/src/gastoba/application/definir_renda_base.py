from uuid import UUID

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.renda_base import RendaBase


class DefinirRendaBase:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, valor: Dinheiro) -> Dinheiro:
        base = RendaBase(usuario_id=usuario_id, valor=valor)
        with self._unidade_de_trabalho as uow:
            uow.renda_base.definir(base.usuario_id, base.valor)
            uow.commit()
            return base.valor
