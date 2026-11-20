from uuid import UUID

from gastoba.domain.excecoes import ContaNaoEncontrada
from gastoba.domain.portas import UnidadeDeTrabalho


class RemoverApelidoDaConta:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, conta_id: UUID) -> None:
        """Tira o apelido; idempotente. ``ContaNaoEncontrada`` se a conta não for da pessoa."""
        with self._unidade_de_trabalho as uow:
            if uow.contas.obter(usuario_id, conta_id) is None:
                raise ContaNaoEncontrada("Conta não encontrada.")
            uow.contas.definir_apelido(usuario_id, conta_id, None)
            uow.commit()
