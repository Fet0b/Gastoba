from uuid import UUID

from gastoba.domain.conta import Conta, PapelDaConta, TipoDaConta
from gastoba.domain.excecoes import ContaNaoEncontrada, TransacaoImportadaInvalida
from gastoba.domain.portas import UnidadeDeTrabalho


class DefinirPapelDaConta:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, conta_id: UUID, papel: PapelDaConta) -> Conta:
        with self._unidade_de_trabalho as uow:
            conta = uow.contas.obter(usuario_id, conta_id)
            if conta is None:
                raise ContaNaoEncontrada("Conta não encontrada.")
            if conta.tipo == TipoDaConta.CARTAO:
                raise TransacaoImportadaInvalida(
                    "Cartão não é conta corrente nem conta de investimento."
                )
            uow.contas.definir_papel(usuario_id, conta_id, papel)
            conta.papel = papel
            uow.commit()
            return conta
