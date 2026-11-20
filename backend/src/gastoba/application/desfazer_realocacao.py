from uuid import UUID

from gastoba.domain.alocacao_de_caixinha import AlocacaoDeCaixinha
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    InvestimentoNaoEncontrado,
    PrincipalInsuficiente,
    RealocacaoNaoEncontrada,
)
from gastoba.domain.mudanca_de_fracao import MudancaDeFracao, mover_fracao
from gastoba.domain.portas import UnidadeDeTrabalho


class DesfazerRealocacao:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, investimento_id: UUID, realocacao_id: UUID) -> None:
        """Apaga uma realocação feita por engano: o valor volta à destinação de origem.

        Numa posição por fração, devolve o peso da caixinha de destino à de origem. Recusa se o
        destino já não tem esse valor (um resgate ou outra realocação o usou), porque ficaria
        negativo. A realocação antiga, gravada antes da fração, segue a regra do principal.
        """
        with self._unidade_de_trabalho as uow:
            if uow.investimentos.obter(usuario_id, investimento_id) is None:
                raise InvestimentoNaoEncontrado("Investimento não encontrado.")
            mudanca = uow.mudancas_de_fracao.obter(usuario_id, realocacao_id)
            if (
                mudanca is not None
                and mudanca.posicao_id == investimento_id
                and mudanca.origem is not None
            ):
                _devolver_fracao(uow, usuario_id, investimento_id, mudanca)
                uow.commit()
                return
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


def _devolver_fracao(
    uow: UnidadeDeTrabalho, usuario_id: UUID, investimento_id: UUID, mudanca: MudancaDeFracao
) -> None:
    assert mudanca.origem is not None
    ids = uow.alocacoes.ids_das_tags(usuario_id)
    pesos = {
        a.destinacao_id: a.peso_centavos
        for a in uow.alocacoes.listar_da_posicao(usuario_id, investimento_id)
    }
    try:
        novos = mover_fracao(
            pesos, ids[mudanca.destino], ids[mudanca.origem], mudanca.valor.centavos
        )
    except PrincipalInsuficiente:
        raise PrincipalInsuficiente(
            f"Não dá para desfazer: a caixinha «{mudanca.destino}» já não tem esse valor "
            "(outra realocação o usou)."
        ) from None
    uow.alocacoes.substituir(
        usuario_id,
        investimento_id,
        [AlocacaoDeCaixinha(investimento_id, i, p) for i, p in novos.items()],
    )
    uow.mudancas_de_fracao.excluir(usuario_id, mudanca.id)
