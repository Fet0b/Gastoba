"""D4 (069): depois de definir as caixinhas, o resgate ligado pela Revisão paga uma compra."""

from datetime import date

import pytest
from test_confirmar_propostas_da_bolsa import (
    BRUTO,
    PESSOA,
    _conta,
    _operacao,
    _posicao,
    _transacao,
)

from gastoba.application.associar_compra_a_destinacao import AssociarCompraADestinacao
from gastoba.application.associar_movimento_ao_investimento import (
    AssociarMovimentoAoInvestimento,
)
from gastoba.application.confirmar_propostas_da_bolsa import (
    ConfirmarPropostasDaBolsa,
    ItemDeConfirmacao,
)
from gastoba.application.listar_revisao_da_bolsa import ListarRevisaoDaBolsa
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.destinacao import Destinacao, ParteDeDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import CoberturaInvalida
from gastoba.domain.gasto import Gasto
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.operacao import TipoDeOperacao
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import SentidoDaTransacao


def _resgate_ligado_pela_revisao(uow):
    conta = _conta(uow)
    posicao = _posicao(uow)
    aporte = MovimentoDeInvestimento(
        conta.id, TipoDeMovimento.APORTE, Dinheiro(10000), "Aporte", date(2026, 10, 1), posicao.id
    )
    compra = Gasto(
        conta.id, Dinheiro(3000), "Compra", date(2026, 11, 6), CategoriaDoGasto.LAZER, ()
    )
    with uow as u:
        u.movimentos_de_investimento.adicionar(aporte)
        u.destinacoes.adicionar(aporte.id, [ParteDeDestinacao(Tag("casa"), Dinheiro(10000))])
        u.gastos.adicionar(compra)
        u.commit()
    _operacao(uow, posicao, 5000, tipo=TipoDeOperacao.VENDA)
    _transacao(uow, conta, BRUTO, 5000, "b", sentido=SentidoDaTransacao.ENTRADA)
    (proposta,) = ListarRevisaoDaBolsa(uow).executar(PESSOA).propostas
    ConfirmarPropostasDaBolsa(uow).executar(
        PESSOA, [ItemDeConfirmacao(proposta.proposta.chave, proposta.versao)]
    )
    (resgate,) = [
        m
        for m in uow.confirmado.movimentos_de_investimento.values()
        if m.tipo == TipoDeMovimento.RESGATE
    ]
    return posicao, resgate, compra


def test_cobrir_sem_caixinhas_e_recusado_e_depois_de_definir_e_aceito(unidade_de_trabalho):
    uow = unidade_de_trabalho
    posicao, resgate, compra = _resgate_ligado_pela_revisao(uow)
    with pytest.raises(CoberturaInvalida):
        AssociarCompraADestinacao(uow).executar(
            PESSOA, compra.id, "casa", Dinheiro(3000), movimento_id=resgate.id
        )
    AssociarMovimentoAoInvestimento(uow).executar(
        PESSOA, resgate.id, posicao.id, [Destinacao(Tag("casa"), 100)]
    )
    cobertura = AssociarCompraADestinacao(uow).executar(
        PESSOA, compra.id, "casa", Dinheiro(3000), movimento_id=resgate.id
    )
    assert cobertura.valor == Dinheiro(3000)
    assert cobertura.movimento_id == resgate.id
