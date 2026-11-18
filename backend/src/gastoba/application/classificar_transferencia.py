from uuid import UUID

from gastoba.domain.excecoes import (
    ContaNaoEncontrada,
    TransacaoImportadaInvalida,
    TransacaoImportadaNaoEncontrada,
)
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.transacao_importada import EstadoDaTransacaoImportada
from gastoba.domain.transferencia_entre_contas import (
    TransferenciaEntreContas,
    criar_transferencia_pelas_pontas,
)


def obter_ponta(uow, usuario_id, transacao_id):
    t = uow.transacoes_importadas.obter(usuario_id, transacao_id)
    if t is None:
        raise TransacaoImportadaNaoEncontrada("Transação importada não encontrada.")
    if t.estado == EstadoDaTransacaoImportada.ACEITA or uow.transferencias.da_transacao(
        usuario_id, t.id
    ):
        raise TransacaoImportadaInvalida("Esta transação já está classificada.")
    return t


def aceitar_ponta(uow, t):
    if t.estado == EstadoDaTransacaoImportada.IGNORADA:
        t.restaurar()
    t.aceitar()
    uow.transacoes_importadas.atualizar_estado(t)


def montar_transferencia(uow, usuario_id, t, contraparte_id, par):
    conta = uow.contas.obter(usuario_id, t.conta_id)
    outra = uow.contas.obter(usuario_id, contraparte_id)
    if conta is None or outra is None:
        raise ContaNaoEncontrada("Conta não encontrada.")
    return criar_transferencia_pelas_pontas(usuario_id, conta, outra, t, par)


class ClassificarTransferencia:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        transacao_id: UUID,
        conta_contraparte_id: UUID,
        par_transacao_id: UUID | None = None,
    ) -> TransferenciaEntreContas:
        with self._unidade_de_trabalho as uow:
            t = obter_ponta(uow, usuario_id, transacao_id)
            par = obter_ponta(uow, usuario_id, par_transacao_id) if par_transacao_id else None
            transferencia = montar_transferencia(uow, usuario_id, t, conta_contraparte_id, par)
            uow.transferencias.salvar(transferencia)
            for ponta in (t, par):
                if ponta:
                    aceitar_ponta(uow, ponta)
            uow.commit()
            return transferencia
