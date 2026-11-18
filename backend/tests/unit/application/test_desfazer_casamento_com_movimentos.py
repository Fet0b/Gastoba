from datetime import date
from uuid import uuid4

import pytest
from test_confirmar_propostas_da_bolsa import (
    BRUTO,
    PESSOA,
    TAXA,
    _conta,
    _operacao,
    _posicao,
    _transacao,
)

from gastoba.application.confirmar_propostas_da_bolsa import (
    ConfirmarPropostasDaBolsa,
    ItemDeConfirmacao,
)
from gastoba.application.desfazer_casamento import DesfazerCasamento
from gastoba.application.listar_revisao_da_bolsa import ListarRevisaoDaBolsa
from gastoba.application.refazer_casamento import RefazerCasamento
from gastoba.domain.casamento_de_operacao import (
    CasamentoDeOperacao,
    PapelDoVinculo,
    VinculoDeCasamento,
)
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import CasamentoAmbiguo, CasamentoNaoEncontrado, MovimentoNaoDesfazivel
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    TipoDeMovimento,
)
from gastoba.domain.reaplicacao_de_resgate import ReaplicacaoDeResgate
from gastoba.domain.transacao_importada import EstadoDaTransacaoImportada


def _ligado(uow):
    conta = _conta(uow)
    posicao = _posicao(uow)
    operacao = _operacao(uow, posicao, 278930)
    bruto = _transacao(uow, conta, BRUTO, 278930, "b")
    taxa = _transacao(uow, conta, TAXA, 62, "t")
    (proposta,) = ListarRevisaoDaBolsa(uow).executar(PESSOA).propostas
    (ligacao,) = ConfirmarPropostasDaBolsa(uow).executar(
        PESSOA, [ItemDeConfirmacao(proposta.proposta.chave, proposta.versao)]
    )
    return conta, posicao, operacao, bruto, taxa, ligacao.casamento_id


def test_desfazer_remove_so_os_movimentos_do_casamento_e_devolve_tudo_a_pendente(
    unidade_de_trabalho,
):
    uow = unidade_de_trabalho
    conta, posicao, _, bruto, taxa, casamento_id = _ligado(uow)
    # Um movimento qualquer de outra transação não pode ser tocado.
    outro = MovimentoDeInvestimento(
        conta.id, TipoDeMovimento.APORTE, Dinheiro(500), "Outro aporte", date(2026, 11, 1)
    )
    with uow as u:
        u.movimentos_de_investimento.adicionar(outro)
        u.commit()
    saldos = {k: v.saldo for k, v in uow.confirmado.contas.items()}
    DesfazerCasamento(uow).executar(PESSOA, casamento_id)
    e = uow.confirmado
    assert list(e.movimentos_de_investimento) == [outro.id]
    assert not e.casamentos
    for t in (bruto, taxa):
        assert e.transacoes_importadas[t.id].estado == EstadoDaTransacaoImportada.PENDENTE
    assert {k: v.saldo for k, v in e.contas.items()} == saldos


def test_desfazer_recusa_com_reaplicacao_dependente(unidade_de_trabalho):
    uow = unidade_de_trabalho
    _, _, _, _, _, casamento_id = _ligado(uow)
    (aporte,) = uow.confirmado.movimentos_de_investimento.values()
    resgate = MovimentoDeInvestimento(
        aporte.conta_id, TipoDeMovimento.RESGATE, Dinheiro(100), "Resgate", aporte.data
    )
    with uow as u:
        u.movimentos_de_investimento.adicionar(resgate)
        u.reaplicacoes_de_resgates.adicionar(
            ReaplicacaoDeResgate(resgate.id, aporte.id, Dinheiro(100))
        )
        u.commit()
    with pytest.raises(MovimentoNaoDesfazivel):
        DesfazerCasamento(uow).executar(PESSOA, casamento_id)
    assert uow.confirmado.casamentos and aporte.id in uow.confirmado.movimentos_de_investimento


def test_casamento_antigo_sem_movimento_continua_desfazivel(unidade_de_trabalho):
    uow = unidade_de_trabalho
    conta = _conta(uow)
    posicao = _posicao(uow)
    operacao = _operacao(uow, posicao, 1000)
    bruto = _transacao(uow, conta, BRUTO, 1000, "b")
    with uow as u:
        bruto.aceitar()
        u.transacoes_importadas.atualizar_estado(bruto)
        u.casamentos.adicionar(
            PESSOA,
            CasamentoDeOperacao(
                (operacao.id,), (VinculoDeCasamento(bruto.id, PapelDoVinculo.BRUTO),)
            ),
        )
        u.commit()
    (casamento,) = uow.confirmado.casamentos.values()
    DesfazerCasamento(uow).executar(PESSOA, casamento.id)
    assert (
        uow.confirmado.transacoes_importadas[bruto.id].estado == EstadoDaTransacaoImportada.PENDENTE
    )


# --- refazer a ligação antiga (T029a) -------------------------------------------------------


def _antigo(uow):
    conta = _conta(uow)
    posicao = _posicao(uow)
    operacao = _operacao(uow, posicao, 278930)
    bruto = _transacao(uow, conta, BRUTO, 278930, "b")
    with uow as u:
        bruto.aceitar()
        u.transacoes_importadas.atualizar_estado(bruto)
        u.casamentos.adicionar(
            PESSOA,
            CasamentoDeOperacao(
                (operacao.id,), (VinculoDeCasamento(bruto.id, PapelDoVinculo.BRUTO),)
            ),
        )
        u.commit()
    (casamento,) = uow.confirmado.casamentos.values()
    return operacao, bruto, casamento


def test_refazer_desfaz_e_confirma_de_novo_criando_o_aporte(unidade_de_trabalho):
    uow = unidade_de_trabalho
    operacao, bruto, casamento = _antigo(uow)
    refeito = RefazerCasamento(uow).executar(PESSOA, casamento.id)
    e = uow.confirmado
    assert casamento.id not in e.casamentos and refeito.casamento_id in e.casamentos
    assert e.casamentos[refeito.casamento_id].operacao_ids == (operacao.id,)
    (movimento,) = e.movimentos_de_investimento.values()
    assert movimento.tipo == TipoDeMovimento.APORTE and movimento.valor.centavos == 278930
    assert e.transacoes_importadas[bruto.id].estado == EstadoDaTransacaoImportada.ACEITA


def test_refazer_com_proposta_ambigua_nao_muda_nada(unidade_de_trabalho):
    uow = unidade_de_trabalho
    operacao, bruto, casamento = _antigo(uow)
    # Uma segunda operação igual, ainda sem casamento, torna a proposta ambígua depois de desfazer.
    _operacao(uow, _posicao(uow, "OUTRO", "EQUITY", "outro"), 278930)
    with pytest.raises(CasamentoAmbiguo):
        RefazerCasamento(uow).executar(PESSOA, casamento.id)
    e = uow.confirmado
    assert casamento.id in e.casamentos and not e.movimentos_de_investimento
    assert e.transacoes_importadas[bruto.id].estado == EstadoDaTransacaoImportada.ACEITA


def test_refazer_recusa_casamento_que_ja_tem_movimentos_e_casamento_alheio(unidade_de_trabalho):
    uow = unidade_de_trabalho
    _, _, _, _, _, casamento_id = _ligado(uow)
    with pytest.raises(MovimentoNaoDesfazivel):
        RefazerCasamento(uow).executar(PESSOA, casamento_id)
    with pytest.raises(CasamentoNaoEncontrado):
        RefazerCasamento(uow).executar(uuid4(), casamento_id)
