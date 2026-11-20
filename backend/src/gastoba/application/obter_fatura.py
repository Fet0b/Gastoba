from dataclasses import dataclass
from datetime import date
from uuid import UUID

from gastoba.domain.excecoes import FaturaNaoEncontrada
from gastoba.domain.fatura import CompraDoCartao, Fatura, SituacaoDaFatura
from gastoba.domain.portas import UnidadeDeTrabalho


@dataclass(frozen=True, slots=True)
class FaturaDetalhada:
    fatura: Fatura
    situacao: SituacaoDaFatura
    compras: list[CompraDoCartao]


class ObterFatura:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, fatura_id: UUID, hoje: date) -> FaturaDetalhada:
        """A fatura com as compras e os pagamentos; ``FaturaNaoEncontrada`` se não for da pessoa."""
        with self._unidade_de_trabalho as uow:
            fatura = uow.faturas.obter(usuario_id, fatura_id)
            if fatura is None:
                raise FaturaNaoEncontrada("Fatura não encontrada.")
            return FaturaDetalhada(
                fatura=fatura,
                situacao=fatura.situacao(hoje),
                compras=uow.faturas.compras_da_fatura(usuario_id, fatura_id),
            )
