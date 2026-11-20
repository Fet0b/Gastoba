from uuid import UUID

from gastoba.application.confirmar_propostas_da_bolsa import (
    ConfirmarPropostasDaBolsa,
    ItemDeConfirmacao,
    LigacaoConfirmada,
)
from gastoba.application.desfazer_classificacao_importada import desfazer_sem_confirmar
from gastoba.application.listar_revisao_da_bolsa import montar_revisao
from gastoba.domain.casamento_de_liquidacao import Tolerancia
from gastoba.domain.excecoes import (
    CasamentoAmbiguo,
    MovimentoNaoDesfazivel,
    TransacaoImportadaNaoEncontrada,
)
from gastoba.domain.natureza_do_movimento import NaturezaDoMovimento, natureza_da_descricao
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.revisao_da_bolsa import EXATA
from gastoba.domain.transacao_importada import EstadoDaTransacaoImportada


class TrocarGastoPelaLigacao:
    """Troca o gasto antigo de uma liquidação da bolsa pela ligação com as operações (D7).

    Tudo ou nada, numa unidade de trabalho: o gasto sai com a reversão registrada (a mesma de
    "desfazer classificação") e a transação é ligada à proposta exata que a contém. Sem proposta
    exata única, nada muda. Só age quando a pessoa pede; nenhum gasto antigo é trocado sozinho."""

    def __init__(
        self, unidade_de_trabalho: UnidadeDeTrabalho, tolerancia: Tolerancia | None = None
    ) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._tolerancia = tolerancia or Tolerancia()

    def executar(self, usuario_id: UUID, transacao_id: UUID) -> LigacaoConfirmada:
        with self._unidade_de_trabalho as uow:
            transacao = uow.transacoes_importadas.obter(usuario_id, transacao_id)
            if transacao is None:
                raise TransacaoImportadaNaoEncontrada("Transação importada não encontrada.")
            gastos = uow.gastos.da_transacao(usuario_id, transacao.id)
            if (
                transacao.estado != EstadoDaTransacaoImportada.ACEITA
                or natureza_da_descricao(transacao.descricao)
                != NaturezaDoMovimento.LIQUIDACAO_DE_BOLSA
                or len(gastos) != 1
                or uow.ganhos.da_transacao(usuario_id, transacao.id)
                or uow.movimentos_de_investimento.da_transacao(usuario_id, transacao.id)
            ):
                raise MovimentoNaoDesfazivel(
                    "Só uma liquidação da bolsa aceita como um gasto pode ser trocada pela ligação."
                )
            desfazer_sem_confirmar(uow, usuario_id, transacao.id, confirmar=False)
            revisao = montar_revisao(uow, usuario_id, self._tolerancia)
            candidatas = [
                p
                for p in revisao.propostas
                if p.proposta.confianca == EXATA
                and any(t.transacao.id == transacao.id for t in p.proposta.bruto)
            ]
            if len(candidatas) != 1:
                raise CasamentoAmbiguo(
                    "Não há uma ligação única para esta liquidação. Nada foi alterado."
                )
            (listada,) = candidatas
            (ligacao,) = ConfirmarPropostasDaBolsa(
                self._unidade_de_trabalho, self._tolerancia
            ).confirmar_na_unidade(
                uow, usuario_id, [ItemDeConfirmacao(listada.proposta.chave, listada.versao)]
            )
            uow.commit()
            return ligacao
