from datetime import date
from uuid import UUID

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.distribuicao_por_tags import ResumoPorTags
from gastoba.domain.excecoes import ContaNaoEncontrada, PeriodoInvalido
from gastoba.domain.portas import UnidadeDeTrabalho


class ResumirGastosPorTag:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        inicio: date,
        fim: date,
        conta_id: UUID | None = None,
        categoria: CategoriaDoGasto | None = None,
    ) -> ResumoPorTags:
        """Como o total dos gastos do período se divide entre as tags."""
        with self._unidade_de_trabalho as uow:
            if inicio > fim:
                raise PeriodoInvalido("A data inicial do período não pode ser depois da final.")
            if conta_id is not None and uow.contas.obter(usuario_id, conta_id) is None:
                raise ContaNaoEncontrada("Conta não encontrada.")
            gastos = uow.gastos.listar(
                usuario_id, inicio, fim, conta_id=conta_id, tag=None, categoria=categoria
            )
            return ResumoPorTags.de_gastos(gastos)
