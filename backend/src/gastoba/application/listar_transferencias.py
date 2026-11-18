from datetime import date
from uuid import UUID

from gastoba.domain.excecoes import PeriodoInvalido
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.transferencia_entre_contas import TransferenciaEntreContas


class ListarTransferencias:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, inicio: date, fim: date) -> list[TransferenciaEntreContas]:
        if inicio > fim:
            raise PeriodoInvalido("O início deve ser anterior ao fim.")
        with self._unidade_de_trabalho as uow:
            return uow.transferencias.listar(usuario_id, inicio, fim)
