from uuid import UUID

from gastoba.domain.excecoes import ContaImportada, ContaNaoEncontrada
from gastoba.domain.portas import UnidadeDeTrabalho


class ExcluirConta:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, conta_id: UUID) -> None:
        """Apaga a conta manual e todo o histórico dela numa só transação.

        A conta importada não pode ser apagada: a próxima sincronização a recriaria.
        """
        with self._unidade_de_trabalho as uow:
            conta = uow.contas.obter(usuario_id, conta_id)
            if conta is None:
                raise ContaNaoEncontrada("Conta não encontrada.")
            if conta.saldo_e_do_banco:
                raise ContaImportada("Conta importada do banco não pode ser excluída.")
            uow.contas.excluir(usuario_id, conta_id)
            uow.commit()
