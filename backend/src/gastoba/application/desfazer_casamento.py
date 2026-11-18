from uuid import UUID

from gastoba.domain.casamento_de_operacao import CasamentoDeOperacao, PapelDoVinculo
from gastoba.domain.excecoes import CasamentoNaoEncontrado, MovimentoNaoDesfazivel
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, OrigemDoMovimento
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.transacao_importada import EstadoDaTransacaoImportada


def movimentos_do_casamento(
    uow, usuario_id: UUID, casamento: CasamentoDeOperacao
) -> list[MovimentoDeInvestimento]:
    """Os aportes e resgates que a ligação criou: um por operação, na conta do bruto, com o
    investimento e o valor da operação. Nunca toca em movimento de outra origem."""
    operacoes = [uow.operacoes.obter(usuario_id, i) for i in casamento.operacao_ids]
    esperados = [(o.posicao_id, o.valor_bruto) for o in operacoes if o is not None]
    encontrados: list[MovimentoDeInvestimento] = []
    for vinculo in casamento.vinculos:
        if vinculo.papel != PapelDoVinculo.BRUTO:
            continue
        for m in uow.movimentos_de_investimento.da_transacao(
            usuario_id, vinculo.transacao_importada_id
        ):
            chave = (m.investimento_id, m.valor)
            if m.origem == OrigemDoMovimento.OPEN_FINANCE and chave in esperados:
                esperados.remove(chave)
                encontrados.append(m)
    return encontrados


def desfazer_casamento_na_unidade(uow, usuario_id: UUID, casamento_id: UUID) -> int:
    """Desfaz dentro da unidade de trabalho de quem chama (sem ``commit``). Devolve quantos
    movimentos saíram."""
    casamento = uow.casamentos.obter(usuario_id, casamento_id)
    if casamento is None:
        raise CasamentoNaoEncontrado("Casamento não encontrado.")
    movimentos = movimentos_do_casamento(uow, usuario_id, casamento)
    ids = [m.id for m in movimentos]
    if movimentos:
        uow.reaplicacoes_de_resgates.bloquear(usuario_id)
        if any(uow.reaplicacoes_de_resgates.para_movimento(usuario_id, i) for i in ids):
            raise MovimentoNaoDesfazivel(
                "Desfaça primeiro a reaplicação vinculada a um destes movimentos."
            )
        if uow.coberturas.resgate_em_uso(ids):
            raise MovimentoNaoDesfazivel(
                "Um destes resgates paga uma compra: desfaça a associação da compra antes."
            )
        if uow.destinacoes.do_movimento(ids):
            raise MovimentoNaoDesfazivel(
                "Um destes movimentos já tem destinações: desfaça-as antes. Nada foi alterado."
            )
        relacionados = uow.movimentos_de_investimento.listar_relacionados(usuario_id, ids)
        if any(m.id not in set(ids) for m in relacionados):
            raise MovimentoNaoDesfazivel(
                "Desfaça primeiro os custos ou impostos ligados a estas operações."
            )
    for movimento in movimentos:
        uow.movimentos_de_investimento.excluir(movimento.id)
    for vinculo in casamento.vinculos:
        transacao = uow.transacoes_importadas.obter(usuario_id, vinculo.transacao_importada_id)
        if transacao is not None and transacao.estado == EstadoDaTransacaoImportada.ACEITA:
            transacao.reabrir()
            uow.transacoes_importadas.atualizar_estado(transacao)
    uow.casamentos.remover(usuario_id, casamento_id)
    return len(movimentos)


class DesfazerCasamento:
    """Desfaz a ligação: remove só os aportes e resgates que ela criou, devolve todas as
    transações a pendentes e tira o vínculo (e com ele o custo vindo dos débitos casados). Não
    toca destinações, alocações nem saldo, e recusa se há reaplicação ou cobertura dependente. A
    classificação antiga fica na trilha de reversões; a pessoa decide de novo na caixa (D8)."""

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, casamento_id: UUID) -> None:
        with self._unidade_de_trabalho as uow:
            desfazer_casamento_na_unidade(uow, usuario_id, casamento_id)
            uow.commit()
