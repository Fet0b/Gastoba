from uuid import UUID

from gastoba.application.confirmar_propostas_da_bolsa import (
    ConfirmarPropostasDaBolsa,
    ItemDeConfirmacao,
    LigacaoConfirmada,
)
from gastoba.application.desfazer_casamento import (
    desfazer_casamento_na_unidade,
    movimentos_do_casamento,
)
from gastoba.application.listar_revisao_da_bolsa import montar_revisao
from gastoba.domain.casamento_de_liquidacao import Tolerancia
from gastoba.domain.excecoes import CasamentoAmbiguo, CasamentoNaoEncontrado, MovimentoNaoDesfazivel
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.revisao_da_bolsa import EXATA


class RefazerCasamento:
    """Refaz uma ligação antiga **sem aporte registrado**: desfaz e confirma de novo na mesma
    unidade de trabalho. Só prossegue se a proposta recalculada for exata, com as mesmas operações;
    senão nada muda (rollback). Ligação que já tem movimentos usa "Desfazer ligação"."""

    def __init__(
        self, unidade_de_trabalho: UnidadeDeTrabalho, tolerancia: Tolerancia | None = None
    ) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._tolerancia = tolerancia or Tolerancia()

    def executar(self, usuario_id: UUID, casamento_id: UUID) -> LigacaoConfirmada:
        with self._unidade_de_trabalho as uow:
            casamento = uow.casamentos.obter(usuario_id, casamento_id)
            if casamento is None:
                raise CasamentoNaoEncontrado("Casamento não encontrado.")
            if movimentos_do_casamento(uow, usuario_id, casamento):
                raise MovimentoNaoDesfazivel(
                    "Esta ligação já registrou aportes ou resgates: use Desfazer ligação."
                )
            desfazer_casamento_na_unidade(uow, usuario_id, casamento_id)
            revisao = montar_revisao(uow, usuario_id, self._tolerancia)
            iguais = [
                p
                for p in revisao.propostas
                if p.proposta.confianca == EXATA
                and {o.operacao.id for o in p.proposta.operacoes} == set(casamento.operacao_ids)
            ]
            if len(iguais) != 1:
                raise CasamentoAmbiguo(
                    "Não há uma ligação única para estas operações. Nada foi alterado."
                )
            (listada,) = iguais
            (ligacao,) = ConfirmarPropostasDaBolsa(
                self._unidade_de_trabalho, self._tolerancia
            ).confirmar_na_unidade(
                uow, usuario_id, [ItemDeConfirmacao(listada.proposta.chave, listada.versao)]
            )
            uow.commit()
            return ligacao
