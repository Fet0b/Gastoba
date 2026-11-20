from uuid import UUID

from gastoba.domain.excecoes import TratamentoNaoEncontrado
from gastoba.domain.portas import Relogio, UnidadeDeTrabalho
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    MotivoDaTransacaoIgnorada,
)


class DesfazerTratamentoDeAporte:
    """Restaura o aporte idêntico: ele volta às listas e aos totais e, se a transação foi
    reaberta na aprovação e ainda está pendente, volta a aceita."""

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho, relogio: Relogio) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._relogio = relogio

    def executar(self, usuario_id: UUID, tratamento_id: UUID) -> None:
        with self._unidade_de_trabalho as uow:
            tratamento = uow.tratamentos.obter(usuario_id, tratamento_id)
            if tratamento is None or not tratamento.ativo:
                raise TratamentoNaoEncontrado("Tratamento não encontrado.")
            reaberta = tratamento.aprovado_em is not None
            tratamento.desfeito_em = self._relogio.agora()
            uow.tratamentos.atualizar(usuario_id, tratamento)
            origem = tratamento.valores_originais.get("transacao_importada_id")
            if reaberta and origem:
                transacao = uow.transacoes_importadas.obter(usuario_id, UUID(origem))
                if transacao is not None and (
                    transacao.estado == EstadoDaTransacaoImportada.PENDENTE
                    or transacao.motivo_ignorada
                    == MotivoDaTransacaoIgnorada.MOVIMENTO_INTERNO_DA_CONTA
                ):
                    transacao.reaceitar()
                    uow.transacoes_importadas.atualizar_estado(transacao)
            uow.commit()

    def por_movimento(self, usuario_id: UUID, movimento_id: UUID) -> None:
        """Desfaz o tratamento ativo de um aporte, achado pelo movimento."""
        with self._unidade_de_trabalho as uow:
            tratamento = uow.tratamentos.ativo_do_movimento(usuario_id, movimento_id)
        if tratamento is None:
            raise TratamentoNaoEncontrado("Este aporte não tem tratamento para desfazer.")
        self.executar(usuario_id, tratamento.id)
