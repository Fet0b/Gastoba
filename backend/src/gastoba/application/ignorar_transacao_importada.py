from uuid import UUID

from gastoba.domain.excecoes import TransacaoImportadaNaoEncontrada
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.transacao_importada import MotivoDaTransacaoIgnorada


class IgnorarTransacaoImportada:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self, usuario_id: UUID, transacao_id: UUID, motivo: MotivoDaTransacaoIgnorada | None = None
    ) -> None:
        """Marca a transação pendente como ignorada; ela não vira gasto nem ganho."""
        with self._unidade_de_trabalho as uow:
            transacao = uow.transacoes_importadas.obter(usuario_id, transacao_id)
            if transacao is None:
                raise TransacaoImportadaNaoEncontrada("Transação importada não encontrada.")
            transacao.ignorar(motivo)
            uow.transacoes_importadas.atualizar_estado(transacao)
            uow.commit()
