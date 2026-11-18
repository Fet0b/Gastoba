from dataclasses import dataclass
from uuid import UUID

from gastoba.domain.gasto import Gasto
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.recorrencia import Recorrencia


@dataclass(frozen=True, slots=True)
class PendenciasDeRevisao:
    aportes: list[MovimentoDeInvestimento]
    gastos: list[Gasto]
    recorrencias: list[Recorrencia]


class ListarPendenciasDeRevisao:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> PendenciasDeRevisao:
        with self._unidade_de_trabalho as uow:
            return PendenciasDeRevisao(
                uow.movimentos_de_investimento.listar_pendentes_de_revisao(usuario_id),
                uow.gastos.listar_da_categoria_legada(usuario_id),
                uow.recorrencias.listar_da_categoria_legada(usuario_id),
            )
