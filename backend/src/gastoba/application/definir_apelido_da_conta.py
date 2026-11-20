from uuid import UUID

from gastoba.domain.conta import Conta, validar_apelido
from gastoba.domain.excecoes import ContaNaoEncontrada
from gastoba.domain.portas import UnidadeDeTrabalho


class DefinirApelidoDaConta:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, conta_id: UUID, apelido: str) -> Conta:
        """Dá, ou troca, o apelido da conta da pessoa.

        ``ApelidoInvalido``, ``ApelidoJaExiste`` ou ``ContaNaoEncontrada`` se não puder.
        """
        valido = validar_apelido(apelido)
        with self._unidade_de_trabalho as uow:
            conta = uow.contas.obter(usuario_id, conta_id)
            if conta is None:
                raise ContaNaoEncontrada("Conta não encontrada.")
            uow.contas.definir_apelido(usuario_id, conta_id, valido)
            conta.apelido = valido
            uow.commit()
            return conta
