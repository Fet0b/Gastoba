from datetime import date
from uuid import UUID

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ContaNaoEncontrada
from gastoba.domain.gasto import Gasto
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.tag import Tag


class RegistrarGasto:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        conta_id: UUID,
        valor: Dinheiro,
        descricao: str,
        data: date,
        categoria: CategoriaDoGasto,
        tags: list[str],
    ) -> Gasto:
        """Grava o gasto e debita a conta numa só transação; se algo falhar, nada é gravado."""
        with self._unidade_de_trabalho as uow:
            conta = uow.contas.obter(usuario_id, conta_id)
            if conta is None:
                raise ContaNaoEncontrada("Conta não encontrada.")
            tags_do_gasto = tuple(Tag.de_texto(tag) for tag in tags)
            gasto = Gasto(
                conta_id=conta.id,
                valor=valor,
                descricao=descricao,
                data=data,
                categoria=categoria,
                tags=tags_do_gasto,
            )
            uow.gastos.adicionar(gasto)
            # O saldo de uma conta importada é o do banco: o lançamento manual não o altera.
            if not conta.saldo_e_do_banco:
                # Valida no domínio que o novo saldo cabe no limite do Dinheiro antes do débito.
                conta.debitar(gasto.valor)
                uow.contas.debitar(conta.id, gasto.valor)
            uow.commit()
            return gasto
