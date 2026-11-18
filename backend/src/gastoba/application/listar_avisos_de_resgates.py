from dataclasses import dataclass
from uuid import UUID

from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento
from gastoba.domain.portas import UnidadeDeTrabalho


@dataclass(frozen=True)
class AvisoDeResgate:
    movimento: MovimentoDeInvestimento
    investimento_nome: str | None


class ListarAvisosDeResgates:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> list[AvisoDeResgate]:
        with self._unidade_de_trabalho as uow:
            nomes = {i.id: i.nome for i in uow.investimentos.listar_posicoes(usuario_id)}
            return [
                AvisoDeResgate(m, nomes.get(m.investimento_id))
                for m in uow.movimentos_de_investimento.listar_resgates_sem_destinacao(usuario_id)
            ]
