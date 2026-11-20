from uuid import UUID

from gastoba.application.consultar_impacto_da_reversao import impacto_do_grupo
from gastoba.application.desfazer_classificacao_de_investimento import (
    ClassificacaoDesfeita,
    registrar_reversao,
    reservar_reversao,
    reverter_grupo,
)
from gastoba.domain.excecoes import (
    MovimentoNaoDesfazivel,
    TransacaoCasada,
    TransacaoImportadaNaoEncontrada,
)
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.transacao_importada import EstadoDaTransacaoImportada


def desfazer_sem_confirmar(
    uow,
    usuario_id: UUID,
    transacao_id: UUID,
    *,
    desfazer_divisao_inteira=False,
    desfazer_dependencias=False,
    versao_esperada: str | None = None,
    confirmar=True,
):
    """Desfaz a classificação dentro da unidade de trabalho de quem chama. Com ``confirmar=False``
    não faz ``commit``: serve para compor com outra escrita numa só transação (reclassificar)."""
    transacao = uow.transacoes_importadas.obter(usuario_id, transacao_id)
    if transacao is None:
        raise TransacaoImportadaNaoEncontrada("Transação importada não encontrada.")
    if transacao.id in uow.casamentos.transacoes_casadas(usuario_id):
        raise TransacaoCasada("Desfaça a ligação na Revisão da bolsa.")
    if transacao.estado == EstadoDaTransacaoImportada.PENDENTE:
        raise MovimentoNaoDesfazivel("Esta transação já está na caixa de entrada.")
    gastos = uow.gastos.da_transacao(usuario_id, transacao.id)
    ganhos = uow.ganhos.da_transacao(usuario_id, transacao.id)
    movimentos = uow.movimentos_de_investimento.da_transacao(usuario_id, transacao.id)
    impacto = impacto_do_grupo(uow, usuario_id, transacao, [*gastos, *ganhos, *movimentos])
    if versao_esperada is not None and impacto.versao != versao_esperada:
        raise MovimentoNaoDesfazivel("A classificação mudou. Confira a prévia novamente.")
    transferencia = uow.transferencias.da_transacao(usuario_id, transacao.id)
    if transferencia:
        if versao_esperada is None:
            raise MovimentoNaoDesfazivel("Confira a prévia para desfazer a transferência inteira.")
        pontas = [
            uow.transacoes_importadas.obter(usuario_id, i) for i in transferencia.transacao_ids
        ]
        if any(t is None or t.estado != EstadoDaTransacaoImportada.ACEITA for t in pontas):
            raise MovimentoNaoDesfazivel("Uma ponta da transferência mudou. Nada foi alterado.")
        for ponta in pontas:
            reservar_reversao(uow, ponta)
            registrar_reversao(uow, usuario_id, ponta, [transferencia])
            ponta.reabrir()
            uow.transacoes_importadas.atualizar_estado(ponta)
        transferencia.ativa = False
        uow.transferencias.salvar(transferencia)
        if confirmar:
            uow.commit()
        return ClassificacaoDesfeita(transacao.id, 1)
    if transacao.estado == EstadoDaTransacaoImportada.IGNORADA:
        if gastos or ganhos or movimentos:
            raise MovimentoNaoDesfazivel("Transação ignorada com lançamentos: revise a origem.")
        reservar_reversao(uow, transacao)
        registrar_reversao(uow, usuario_id, transacao, [])
        transacao.restaurar()
        uow.transacoes_importadas.atualizar_estado(transacao)
        if confirmar:
            uow.commit()
        return ClassificacaoDesfeita(transacao.id, 0)
    dependencias = uow.coberturas.listar_por_resgates(usuario_id, [m.id for m in movimentos])
    if dependencias and not desfazer_dependencias:
        raise MovimentoNaoDesfazivel(
            "Este resgate paga compras. Confirme a remoção das coberturas indicadas na prévia."
        )
    return reverter_grupo(
        uow,
        usuario_id,
        transacao,
        gastos,
        ganhos,
        movimentos,
        desfazer_divisao_inteira=desfazer_divisao_inteira,
        coberturas_dependentes=dependencias,
        confirmar=confirmar,
    )


class DesfazerClassificacaoImportada:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        transacao_id: UUID,
        *,
        desfazer_divisao_inteira=False,
        desfazer_dependencias=False,
        versao_esperada: str | None = None,
    ):
        with self._unidade_de_trabalho as uow:
            return desfazer_sem_confirmar(
                uow,
                usuario_id,
                transacao_id,
                desfazer_divisao_inteira=desfazer_divisao_inteira,
                desfazer_dependencias=desfazer_dependencias,
                versao_esperada=versao_esperada,
            )
