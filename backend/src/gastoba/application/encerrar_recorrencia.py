from uuid import UUID

from gastoba.domain.excecoes import RecorrenciaNaoEncontrada
from gastoba.domain.portas import UnidadeDeTrabalho


class EncerrarRecorrencia:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, id: UUID) -> None:
        """Para de gerar; o que já foi gerado fica. Encerrar uma já encerrada não muda nada."""
        with self._unidade_de_trabalho as uow:
            recorrencia = uow.recorrencias.obter(usuario_id, id)
            if recorrencia is None:
                raise RecorrenciaNaoEncontrada("Recorrência não encontrada.")
            if recorrencia.ativa:
                recorrencia.ativa = False
                uow.recorrencias.atualizar(recorrencia)
                uow.commit()
