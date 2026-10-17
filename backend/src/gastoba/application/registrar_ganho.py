from datetime import date
from uuid import UUID

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ContaNaoEncontrada
from gastoba.domain.ganho import Ganho
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.tag import Tag


class RegistrarGanho:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        conta_id: UUID,
        valor: Dinheiro,
        descricao: str,
        data: date,
        tags: list[str],
    ) -> Ganho:
        """Grava o ganho e credita a conta numa só transação; se algo falhar, nada é gravado."""
        with self._unidade_de_trabalho as uow:
            conta = uow.contas.obter(usuario_id, conta_id)
            if conta is None:
                raise ContaNaoEncontrada("Conta não encontrada.")
            ganho = Ganho(
                conta_id=conta.id,
                valor=valor,
                descricao=descricao,
                data=data,
                tags=tuple(Tag.de_texto(tag) for tag in tags),
            )
            uow.ganhos.adicionar(ganho)
            # O saldo de uma conta importada é o do banco: o lançamento manual não o altera.
            if not conta.saldo_e_do_banco:
                # Valida no domínio que o novo saldo cabe no limite do Dinheiro antes do crédito.
                conta.creditar(ganho.valor)
                uow.contas.creditar(conta.id, ganho.valor)
            uow.commit()
            return ganho
