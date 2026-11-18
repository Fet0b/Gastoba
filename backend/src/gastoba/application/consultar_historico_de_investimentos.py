from datetime import date
from uuid import UUID

from gastoba.domain.excecoes import PeriodoInvalido
from gastoba.domain.investimento import PontoDoHistorico
from gastoba.domain.portas import UnidadeDeTrabalho


class ConsultarHistoricoDeInvestimentos:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, inicio: date, fim: date) -> list[PontoDoHistorico]:
        """Os saldos diários registrados no período (inclusivo); só existem desde que o Gastoba
        começou a guardá-los."""
        if inicio > fim:
            raise PeriodoInvalido("O início do período não pode ser depois do fim.")
        with self._unidade_de_trabalho as uow:
            return uow.investimentos.historico(usuario_id, inicio, fim)
