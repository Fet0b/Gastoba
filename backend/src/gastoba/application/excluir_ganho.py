from uuid import UUID

from gastoba.domain.excecoes import GanhoDeRecorrencia, GanhoNaoEncontrado
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.transacao_importada import EstadoDaTransacaoImportada


class ExcluirGanho:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, ganho_id: UUID) -> None:
        """Apaga o ganho e debita a conta numa só transação; se algo falhar, nada muda.

        O ganho gerado por uma recorrência não pode ser apagado: a geração o recriaria no
        mês seguinte. Para parar de gerar, altera-se ou encerra-se a recorrência.

        O ganho aceito da caixa de entrada leva a transação de origem de volta à caixa, para ela
        não ficar "aceita" sem lançamento. Se a transação foi dividida e ainda sobram partes,
        ela continua aceita: reabri-la deixaria essas partes contadas duas vezes num novo aceite.
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
            if ganho.transacao_importada_id is not None:
                self._reabrir_se_nao_sobrou_lancamento(
                    uow, usuario_id, ganho.transacao_importada_id
                )
            uow.commit()

    @staticmethod
    def _reabrir_se_nao_sobrou_lancamento(
        uow: UnidadeDeTrabalho, usuario_id: UUID, transacao_id: UUID
    ) -> None:
        transacao = uow.transacoes_importadas.obter(usuario_id, transacao_id)
        if transacao is None or transacao.estado != EstadoDaTransacaoImportada.ACEITA:
            return
        sobrou = (
            uow.gastos.da_transacao(usuario_id, transacao_id)
            or uow.ganhos.da_transacao(usuario_id, transacao_id)
            or uow.movimentos_de_investimento.da_transacao(usuario_id, transacao_id)
        )
        if sobrou:
            return
        transacao.reabrir()
        uow.transacoes_importadas.atualizar_estado(transacao)
