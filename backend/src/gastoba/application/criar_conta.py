from uuid import UUID

from gastoba.domain.conta import Conta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.portas import UnidadeDeTrabalho


class CriarConta:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, nome: str, saldo_inicial: Dinheiro) -> Conta:
        """Cria a conta; ``ContaJaExiste`` (do repositório) se o nome já for usado."""
        with self._unidade_de_trabalho as uow:
            conta = Conta(usuario_id=usuario_id, nome=nome, saldo=saldo_inicial)
            uow.contas.adicionar(conta)
            uow.commit()
            return conta
