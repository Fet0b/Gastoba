from uuid import UUID

from gastoba.application.conferir_principal_disponivel import conferir_principal_disponivel
from gastoba.domain.excecoes import (
    MovimentoDeInvestimentoNaoEncontrado,
    MovimentoNaoDesfazivel,
)
from gastoba.domain.movimento_de_investimento import OrigemDoMovimento
from gastoba.domain.operacao import OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.portas import UnidadeDeTrabalho


class DesfazerSaldoInicial:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, movimento_id: UUID) -> None:
        """Apaga o saldo inicial definido por engano: o valor volta a ficar sem destinação.

        Este caso só desfaz o saldo inicial; a classificação tem caso de uso próprio.
        Recusa se alguma destinação já não tem o valor (uma realocação ou um resgate o usou).
        """
        with self._unidade_de_trabalho as uow:
            movimento = uow.movimentos_de_investimento.obter(usuario_id, movimento_id)
            if movimento is None:
                raise MovimentoDeInvestimentoNaoEncontrado("Movimento não encontrado.")
            if movimento.origem != OrigemDoMovimento.SALDO_INICIAL:
                raise MovimentoNaoDesfazivel("Só o saldo inicial pode ser desfeito.")
            assert movimento.investimento_id is not None
            conferir_principal_disponivel(uow, usuario_id, [movimento])
            uow.movimentos_de_investimento.excluir(movimento.id)
            # Modelo novo (060): a abertura migrada deste saldo inicial sai junto, para a posição
            # não ficar com uma abertura sem o saldo que a originou.
            for operacao in uow.operacoes.listar_da_posicao(usuario_id, movimento.investimento_id):
                if (
                    operacao.tipo == TipoDeOperacao.ABERTURA
                    and operacao.origem == OrigemDaOperacao.ABERTURA
                    and operacao.quantidade_estimada
                ):
                    uow.operacoes.remover(usuario_id, operacao.id)
            uow.commit()
