from uuid import UUID

from gastoba.application.desfazer_classificacao_de_investimento import (
    registrar_reversao,
    reservar_reversao,
)
from gastoba.domain.excecoes import TransacaoImportadaNaoEncontrada
from gastoba.domain.portas import UnidadeDeTrabalho


class RestaurarTransacaoImportada:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, transacao_id: UUID) -> None:
        """Devolve a transação ignorada à caixa de entrada; não cria gasto, ganho nem muda saldo."""
        with self._unidade_de_trabalho as uow:
            transacao = uow.transacoes_importadas.obter(usuario_id, transacao_id)
            if transacao is None:
                raise TransacaoImportadaNaoEncontrada("Transação importada não encontrada.")
            estado_anterior = transacao.estado
            transacao.restaurar()
            transacao.estado = estado_anterior
            reservar_reversao(uow, transacao)
            registrar_reversao(uow, usuario_id, transacao, [])
            transacao.restaurar()
            uow.transacoes_importadas.atualizar_estado(transacao)
            uow.commit()
