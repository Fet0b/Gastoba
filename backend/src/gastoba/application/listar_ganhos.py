from datetime import date
from uuid import UUID

from gastoba.domain.excecoes import ContaNaoEncontrada, PeriodoInvalido
from gastoba.domain.ganho import Ganho
from gastoba.domain.portas import UnidadeDeTrabalho


class ListarGanhos:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        inicio: date,
        fim: date,
        conta_id: UUID | None = None,
    ) -> list[Ganho]:
        """Ganhos do usuário no período inclusivo, com filtro opcional por conta."""
        with self._unidade_de_trabalho as uow:
            if inicio > fim:
                raise PeriodoInvalido("A data inicial do período não pode ser depois da final.")
            if conta_id is not None and uow.contas.obter(usuario_id, conta_id) is None:
                raise ContaNaoEncontrada("Conta não encontrada.")
            return uow.ganhos.listar(usuario_id, inicio, fim, conta_id=conta_id)
