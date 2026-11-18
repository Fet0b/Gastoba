from dataclasses import dataclass
from datetime import date
from uuid import UUID

from gastoba.application.tratamento_de_aporte_comum import exigir_aporte_sem_investimento
from gastoba.domain.excecoes import MesclaInvalida
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.portas import UnidadeDeTrabalho


@dataclass(frozen=True, slots=True)
class AporteSemInvestimento:
    movimento: MovimentoDeInvestimento
    # Outro aporte da mesma conta, dia e valor: candidato a duplicado. Só sugestão.
    duplicado_sugerido_id: UUID | None
    # Ação já registrada, aguardando a aprovação do dono, ou ``None``.
    tratamento_pendente_de_aprovacao: bool = False


class ListarAportesSemInvestimento:
    """Os aportes antigos sem investimento, com a sugestão de duplicado. Só leitura."""

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> list[AporteSemInvestimento]:
        with self._unidade_de_trabalho as uow:
            todos = uow.movimentos_de_investimento.listar(usuario_id, date.min, date.max)
            aportes = [m for m in todos if m.tipo == TipoDeMovimento.APORTE]
            itens = []
            for m in aportes:
                try:
                    exigir_aporte_sem_investimento(m)
                except MesclaInvalida:
                    continue
                tratamento = uow.tratamentos.ativo_do_movimento(usuario_id, m.id)
                if tratamento is not None and tratamento.aprovado_em is not None:
                    continue
                igual = next(
                    (
                        o.id
                        for o in aportes
                        if o.id != m.id
                        and o.conta_id == m.conta_id
                        and o.data == m.data
                        and o.valor == m.valor
                    ),
                    None,
                )
                itens.append(AporteSemInvestimento(m, igual, tratamento is not None))
            return itens
