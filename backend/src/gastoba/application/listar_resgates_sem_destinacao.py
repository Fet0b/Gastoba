from uuid import UUID

from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento
from gastoba.domain.portas import UnidadeDeTrabalho


class ListarResgatesSemDestinacao:
    """Resgates sem tag: sem destinação não pagam compra e podem ser outra coisa (vencimento)."""

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> list[MovimentoDeInvestimento]:
        with self._unidade_de_trabalho as uow:
            casadas = uow.casamentos.transacoes_casadas(usuario_id)
            return [
                m
                for m in uow.movimentos_de_investimento.listar_resgates_sem_destinacao(usuario_id)
                if m.transacao_importada_id not in casadas
            ]
