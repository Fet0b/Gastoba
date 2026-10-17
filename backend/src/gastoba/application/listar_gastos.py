from datetime import date
from uuid import UUID

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.excecoes import ContaNaoEncontrada, PeriodoInvalido
from gastoba.domain.gasto import Gasto
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.tag import Tag


class ListarGastos:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        inicio: date,
        fim: date,
        conta_id: UUID | None = None,
        tag: str | None = None,
        categoria: CategoriaDoGasto | None = None,
    ) -> list[Gasto]:
        """Gastos do usuário no período inclusivo, com filtros opcionais."""
        with self._unidade_de_trabalho as uow:
            if inicio > fim:
                raise PeriodoInvalido("A data inicial do período não pode ser depois da final.")
            if conta_id is not None and uow.contas.obter(usuario_id, conta_id) is None:
                raise ContaNaoEncontrada("Conta não encontrada.")
            tag_do_filtro = Tag.de_texto(tag) if tag is not None else None
            return uow.gastos.listar(
                usuario_id,
                inicio,
                fim,
                conta_id=conta_id,
                tag=tag_do_filtro,
                categoria=categoria,
            )
