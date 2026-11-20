"""069 (D7 = a, T022): trocar o gasto antigo de uma liquidação pela ligação com as operações."""

from uuid import uuid4

import pytest
from test_confirmar_propostas_da_bolsa import (
    BRUTO,
    PESSOA,
    _conta,
    _operacao,
    _posicao,
    _transacao,
)

from gastoba.application.listar_revisao_da_bolsa import ListarRevisaoDaBolsa
from gastoba.application.trocar_gasto_pela_ligacao import TrocarGastoPelaLigacao
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.excecoes import (
    CasamentoAmbiguo,
    MovimentoNaoDesfazivel,
    TransacaoImportadaNaoEncontrada,
)
from gastoba.domain.gasto import Gasto
from gastoba.domain.movimento_de_investimento import TipoDeMovimento
from gastoba.domain.transacao_importada import EstadoDaTransacaoImportada


def _aceita_como_gasto(uow, conta, transacao):
    gasto = Gasto(
        conta.id, transacao.valor, transacao.descricao, transacao.data, CategoriaDoGasto.LAZER, ()
    )
    gasto.transacao_importada_id = transacao.id
    with uow as u:
        transacao.aceitar()
        u.transacoes_importadas.atualizar_estado(transacao)
        u.gastos.adicionar(gasto)
        u.commit()
    return gasto


def _cenario(uow, valor_da_operacao=5000):
    conta = _conta(uow)
    posicao = _posicao(uow)
    _operacao(uow, posicao, valor_da_operacao)
    bruto = _transacao(uow, conta, BRUTO, 5000, "b")
    gasto = _aceita_como_gasto(uow, conta, bruto)
    return conta, posicao, bruto, gasto


def test_troca_remove_o_gasto_e_liga_a_transacao_criando_o_aporte(unidade_de_trabalho):
    uow = unidade_de_trabalho
    _, posicao, bruto, gasto = _cenario(uow)
    saldos = {k: v.saldo for k, v in uow.confirmado.contas.items()}
    revisao = ListarRevisaoDaBolsa(uow).executar(PESSOA)
    assert revisao.propostas == ()
    ligacao = TrocarGastoPelaLigacao(uow).executar(PESSOA, bruto.id)
    e = uow.confirmado
    assert gasto.id not in e.gastos
    assert e.transacoes_importadas[bruto.id].estado == EstadoDaTransacaoImportada.ACEITA
    assert ligacao.casamento_id in e.casamentos
    (aporte,) = e.movimentos_de_investimento.values()
    assert aporte.tipo == TipoDeMovimento.APORTE and aporte.investimento_id == posicao.id
    assert {k: v.saldo for k, v in e.contas.items()} == saldos


def test_sem_proposta_exata_nada_muda(unidade_de_trabalho):
    uow = unidade_de_trabalho
    conta = _conta(uow)
    bruto = _transacao(uow, conta, BRUTO, 5000, "b")
    gasto = _aceita_como_gasto(uow, conta, bruto)
    with pytest.raises(CasamentoAmbiguo):
        TrocarGastoPelaLigacao(uow).executar(PESSOA, bruto.id)
    e = uow.confirmado
    assert gasto.id in e.gastos and not e.casamentos
    assert e.transacoes_importadas[bruto.id].estado == EstadoDaTransacaoImportada.ACEITA


def test_so_vale_para_liquidacao_aceita_como_gasto(unidade_de_trabalho):
    uow = unidade_de_trabalho
    conta = _conta(uow)
    comum = _transacao(uow, conta, "Mercado", 5000, "m")
    _aceita_como_gasto(uow, conta, comum)
    with pytest.raises(MovimentoNaoDesfazivel):
        TrocarGastoPelaLigacao(uow).executar(PESSOA, comum.id)
    pendente = _transacao(uow, conta, BRUTO, 5000, "p")
    with pytest.raises(MovimentoNaoDesfazivel):
        TrocarGastoPelaLigacao(uow).executar(PESSOA, pendente.id)


def test_transacao_de_outra_pessoa_nao_existe(unidade_de_trabalho):
    uow = unidade_de_trabalho
    _, _, bruto, gasto = _cenario(uow)
    with pytest.raises(TransacaoImportadaNaoEncontrada):
        TrocarGastoPelaLigacao(uow).executar(uuid4(), bruto.id)
    assert gasto.id in uow.confirmado.gastos
