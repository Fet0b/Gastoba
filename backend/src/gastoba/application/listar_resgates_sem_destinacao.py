from dataclasses import dataclass
from uuid import UUID

from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento
from gastoba.domain.portas import UnidadeDeTrabalho


@dataclass(frozen=True)
class ResgateSemDestinacao:
    movimento: MovimentoDeInvestimento
    investimento_nome: str | None


class ListarResgatesSemDestinacao:
    """Resgates sem tag: sem destinação não pagam compra e podem ser outra coisa (vencimento).

    Não entram o resgate de transação ligada pela Revisão da bolsa nem o vencimento confirmado de
    posição sem principal em caixinhas: nos dois casos não há mais nada a decidir."""

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> list[ResgateSemDestinacao]:
        with self._unidade_de_trabalho as uow:
            casadas = uow.casamentos.transacoes_casadas(usuario_id)
            principais = uow.destinacoes.principais(usuario_id)
            nomes = {i.id: i.nome for i in uow.investimentos.listar_posicoes(usuario_id)}
            return [
                ResgateSemDestinacao(m, nomes.get(m.investimento_id))
                for m in uow.movimentos_de_investimento.listar_resgates_sem_destinacao(usuario_id)
                if m.transacao_importada_id not in casadas
                and not (
                    m.vencimento_confirmado
                    and m.investimento_id is not None
                    and not any(
                        p.centavos > 0 for p in principais.get(m.investimento_id, {}).values()
                    )
                )
            ]
