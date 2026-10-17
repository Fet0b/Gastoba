from uuid import UUID

from gastoba.domain.excecoes import GanhoDeRecorrencia, GanhoNaoEncontrado
from gastoba.domain.portas import UnidadeDeTrabalho


class ExcluirGanho:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, ganho_id: UUID) -> None:
        """Apaga o ganho e debita a conta numa só transação; se algo falhar, nada muda.

        O ganho gerado por uma recorrência não pode ser apagado: a geração o recriaria no
        mês seguinte. Para parar de gerar, altera-se ou encerra-se a recorrência.
        """
        with self._unidade_de_trabalho as uow:
            ganho = uow.ganhos.obter(usuario_id, ganho_id)
            if ganho is None:
                raise GanhoNaoEncontrado("Ganho não encontrado.")
            if ganho.recorrencia_id is not None:
                raise GanhoDeRecorrencia(
                    "Este ganho foi criado por uma recorrência. "
                    "Altere ou encerre a recorrência em vez de apagá-lo."
                )
            conta = uow.contas.obter(usuario_id, ganho.conta_id)
            uow.ganhos.remover(ganho.id)
            # O saldo de uma conta importada é o do banco: excluir o ganho não o altera.
            if conta is not None and not conta.saldo_e_do_banco:
                # Valida no domínio que o novo saldo cabe no limite do Dinheiro antes do débito.
                conta.debitar(ganho.valor)
                uow.contas.debitar(ganho.conta_id, ganho.valor)
            uow.commit()
