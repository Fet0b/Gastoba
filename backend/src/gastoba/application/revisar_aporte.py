from collections.abc import Sequence
from uuid import UUID

from gastoba.application.destinar_movimento import preparar_destinacoes
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.excecoes import (
    MovimentoDeInvestimentoNaoEncontrado,
    MovimentoJaAssociado,
    TransacaoImportadaInvalida,
)
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento
from gastoba.domain.portas import UnidadeDeTrabalho


class RevisarAporte:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        movimento_id: UUID,
        categoria: CategoriaDoGasto | None,
        investimento_id: UUID | None = None,
        destinacoes: Sequence[Destinacao] = (),
    ) -> MovimentoDeInvestimento:
        with self._unidade_de_trabalho as uow:
            movimento = uow.movimentos_de_investimento.obter(usuario_id, movimento_id)
            if movimento is None:
                raise MovimentoDeInvestimentoNaoEncontrado("Movimento não encontrado.")
            movimento.revisar(categoria)
            if investimento_id is not None:
                if movimento.investimento_id is not None:
                    raise MovimentoJaAssociado(
                        "Este movimento já está associado a um investimento."
                    )
                partes = preparar_destinacoes(
                    uow, usuario_id, movimento, investimento_id, destinacoes
                )
                uow.movimentos_de_investimento.associar(movimento.id, investimento_id)
                uow.destinacoes.adicionar(movimento.id, partes)
            elif destinacoes:
                raise TransacaoImportadaInvalida("Escolha o investimento para destinar o valor.")
            uow.movimentos_de_investimento.gravar_revisao(movimento)
            uow.commit()
            return movimento
