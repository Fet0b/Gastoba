from uuid import UUID

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    InvestimentoNaoEncontrado,
    PrincipalInsuficiente,
    RealocacaoNaoEncontrada,
)
from gastoba.domain.portas import UnidadeDeTrabalho


class DesfazerRealocacao:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, investimento_id: UUID, realocacao_id: UUID) -> None:
        """Apaga uma realocação feita por engano: o principal volta à destinação de origem.

        Recusa se a destinação de destino já não tem esse principal (um resgate ou outra
        realocação o usou), porque ela ficaria negativa.
        """
        with self._unidade_de_trabalho as uow:
            if uow.investimentos.obter(usuario_id, investimento_id) is None:
                raise InvestimentoNaoEncontrado("Investimento não encontrado.")
            realocacao = next(
                (
                    r
                    for r in uow.destinacoes.listar_realocacoes(usuario_id, investimento_id)
                    if r.id == realocacao_id
                ),
                None,
            )
            if realocacao is None:
                raise RealocacaoNaoEncontrada("Realocação não encontrada.")
            principais = uow.destinacoes.principais(usuario_id).get(investimento_id, {})
            if principais.get(realocacao.destino, Dinheiro(0)).centavos < realocacao.valor.centavos:
                raise PrincipalInsuficiente(
                    f"Não dá para desfazer: a destinação «{realocacao.destino}» já não tem esse "
                    "valor (um resgate ou outra realocação o usou)."
                )
            uow.destinacoes.excluir_realocacao(realocacao.id)
            uow.commit()
