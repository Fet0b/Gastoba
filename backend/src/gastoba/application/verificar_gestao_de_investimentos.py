from uuid import UUID

from gastoba.domain.portas import UnidadeDeTrabalho


class VerificarGestaoDeInvestimentos:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> bool:
        with self._unidade_de_trabalho as uow:
            return uow.investimentos.existe_algum(
                usuario_id
            ) or uow.movimentos_de_investimento.existe_algum(usuario_id)
