from datetime import date
from uuid import UUID

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import RecorrenciaNaoEncontrada
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.recorrencia import Recorrencia
from gastoba.domain.tag import Tag


class AlterarRecorrencia:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        id: UUID,
        valor: Dinheiro,
        descricao: str,
        dia_do_mes: int,
        categoria: CategoriaDoGasto | None,
        tags: list[str],
        fim: date | None,
    ) -> Recorrencia:
        """Troca valor, descrição, dia, categoria, tags e fim; vale dos próximos meses em diante.

        O que a recorrência já gerou não muda. Conta, tipo e início não se alteram.
        """
        with self._unidade_de_trabalho as uow:
            atual = uow.recorrencias.obter(usuario_id, id)
            if atual is None:
                raise RecorrenciaNaoEncontrada("Recorrência não encontrada.")
            alterada = Recorrencia(
                usuario_id=atual.usuario_id,
                tipo=atual.tipo,
                conta_id=atual.conta_id,
                valor=valor,
                descricao=descricao,
                dia_do_mes=dia_do_mes,
                inicio=atual.inicio,
                categoria=categoria,
                tags=tuple(Tag.de_texto(tag) for tag in tags),
                fim=fim,
                ativa=atual.ativa,
                id=atual.id,
            )
            uow.recorrencias.atualizar(alterada)
            uow.commit()
            return alterada
