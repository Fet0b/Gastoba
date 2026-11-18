from uuid import UUID

from gastoba.application.classificar_transferencia import (
    aceitar_ponta,
    montar_transferencia,
    obter_ponta,
)
from gastoba.domain.excecoes import TransacaoImportadaInvalida
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.transferencia_entre_contas import TransferenciaEntreContas


class CompletarParDaTransferencia:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self, usuario_id: UUID, transferencia_id: UUID, transacao_id: UUID
    ) -> TransferenciaEntreContas:
        with self._unidade_de_trabalho as uow:
            anterior = uow.transferencias.obter(usuario_id, transferencia_id)
            if anterior is None or not anterior.ativa:
                raise TransacaoImportadaInvalida("Transferência ativa não encontrada.")
            if len(anterior.transacao_ids) != 1:
                raise TransacaoImportadaInvalida("Esta transferência já tem as duas pontas.")
            existente = uow.transacoes_importadas.obter(usuario_id, anterior.transacao_ids[0])
            nova = obter_ponta(uow, usuario_id, transacao_id)
            contraparte = (
                anterior.conta_destino_id
                if anterior.transacao_origem_id
                else anterior.conta_origem_id
            )
            completa = montar_transferencia(uow, usuario_id, existente, contraparte, nova)
            completa.id = anterior.id
            # A confirmação original dos papéis faz parte da classificação, não muda no pareamento.
            completa.papel_origem = anterior.papel_origem
            completa.papel_destino = anterior.papel_destino
            uow.transferencias.salvar(completa)
            aceitar_ponta(uow, nova)
            uow.commit()
            return completa
