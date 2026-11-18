from collections.abc import Sequence
from uuid import UUID

from gastoba.application.aceitar_transacao_importada import Lancamento, aceitar_sem_confirmar
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.excecoes import TransacaoImportadaInvalida
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.transacao_importada import SentidoDaTransacao

LIMITE_DO_LOTE = 200


class AceitarTransacoesImportadasEmLote:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        transacao_ids: Sequence[UUID],
        categoria: CategoriaDoGasto | None,
        tags: Sequence[str],
        *,
        como_investimento: bool = False,
        investimento_id: UUID | None = None,
        destinacoes: Sequence[Destinacao] = (),
    ) -> list[Lancamento]:
        """Aceita várias saídas pendentes de uma vez, com a mesma categoria e as mesmas tags.

        Tudo ou nada: se qualquer uma falhar (inexistente, já tratada, entrada), nenhuma é aceita.
        Só saídas: a entrada pede outro desfecho (ganho) e continua sendo aceita uma a uma.
        """
        if not 1 <= len(transacao_ids) <= LIMITE_DO_LOTE:
            raise TransacaoImportadaInvalida(
                f"Escolha de 1 a {LIMITE_DO_LOTE} transações para aceitar de uma vez."
            )
        with self._unidade_de_trabalho as uow:
            for transacao_id in transacao_ids:
                transacao = uow.transacoes_importadas.obter(usuario_id, transacao_id)
                if transacao is not None and transacao.sentido != SentidoDaTransacao.SAIDA:
                    raise TransacaoImportadaInvalida(
                        "Aceitar em lote vale só para saídas; aceite as entradas uma a uma."
                    )
            lancamentos = [
                aceitar_sem_confirmar(
                    uow,
                    usuario_id,
                    transacao_id,
                    categoria,
                    tags,
                    como_investimento,
                    investimento_id,
                    destinacoes,
                )
                for transacao_id in transacao_ids
            ]
            uow.commit()
            return lancamentos
