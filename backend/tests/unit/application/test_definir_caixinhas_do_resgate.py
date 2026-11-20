"""D4 (069): definir e remover as caixinhas de um resgate já ligado à posição, sem partes."""

from datetime import date
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

from gastoba.application.associar_compra_a_destinacao import AssociarCompraADestinacao
from gastoba.application.associar_movimento_ao_investimento import (
    AssociarMovimentoAoInvestimento,
)
from gastoba.application.confirmar_propostas_da_bolsa import (
    ConfirmarPropostasDaBolsa,
    ItemDeConfirmacao,
)
from gastoba.application.listar_revisao_da_bolsa import ListarRevisaoDaBolsa
from gastoba.application.remover_caixinhas_do_resgate import RemoverCaixinhasDoResgate
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.destinacao import Destinacao, ParteDeDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    DestinacaoInvalida,
    MovimentoDeInvestimentoNaoEncontrado,
    MovimentoJaAssociado,
    MovimentoNaoDesfazivel,
)
from gastoba.domain.gasto import Gasto
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.operacao import TipoDeOperacao
from gastoba.domain.reaplicacao_de_resgate import ReaplicacaoDeResgate
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import SentidoDaTransacao

DIA_DO_RESGATE = date(2026, 10, 26)


def _com_principal(uow, com_historico=True):
    """Posição com 10000 de principal na tag «casa» e um resgate de 5000 ligado, sem partes."""
    conta = _conta(uow)
    posicao = _posicao(uow)
    aporte = MovimentoDeInvestimento(
        conta.id, TipoDeMovimento.APORTE, Dinheiro(10000), "Aporte", date(2026, 10, 1), posicao.id
    )
    resgate = MovimentoDeInvestimento(
        conta.id, TipoDeMovimento.RESGATE, Dinheiro(5000), "Venda", DIA_DO_RESGATE, posicao.id
    )
    with uow as u:
        u.movimentos_de_investimento.adicionar(aporte)
        u.destinacoes.adicionar(aporte.id, [ParteDeDestinacao(Tag("casa"), Dinheiro(10000))])
        u.movimentos_de_investimento.adicionar(resgate)
        if com_historico:
            # A posição valia 20000 no dia 20: o resgate abate metade do valor, 2500 do principal.
            u.investimentos.salvar_posicao(
                PESSOA,
                _externo(posicao, 20000),
                hoje=date(2026, 10, 20),
            )
        u.commit()
    return conta, posicao, resgate


def _externo(posicao, saldo):
    from gastoba.domain.portas import InvestimentoExterno

    return InvestimentoExterno(
        posicao.id_externo, posicao.nome, posicao.tipo, None, Dinheiro(saldo), "{}"
    )


def _definir(uow, resgate, posicao, destinacoes=None):
    return AssociarMovimentoAoInvestimento(uow).executar(
        PESSOA,
        resgate.id,
        posicao.id,
        [Destinacao(Tag("casa"), 100)] if destinacoes is None else destinacoes,
    )


def _principal(uow, posicao):
    with uow as u:
        return u.destinacoes.principais(PESSOA)[posicao.id][Tag("casa")].centavos


def test_define_as_caixinhas_com_o_principal_abatido_por_custo_medio(unidade_de_trabalho):
    uow = unidade_de_trabalho
    _, posicao, resgate = _com_principal(uow)
    _definir(uow, resgate, posicao)
    with uow as u:
        assert u.destinacoes.resgate_da_tag(resgate.id, Tag("casa")) == (
            Dinheiro(5000),
            Dinheiro(2500),
        )
    assert _principal(uow, posicao) == 7500


def test_sem_historico_anterior_abate_o_valor_em_dinheiro(unidade_de_trabalho):
    uow = unidade_de_trabalho
    _, posicao, resgate = _com_principal(uow, com_historico=False)
    _definir(uow, resgate, posicao)
    assert _principal(uow, posicao) == 5000


def test_resgate_com_partes_e_recusado(unidade_de_trabalho):
    uow = unidade_de_trabalho
    _, posicao, resgate = _com_principal(uow)
    _definir(uow, resgate, posicao)
    with pytest.raises(MovimentoJaAssociado):
        _definir(uow, resgate, posicao)
    assert _principal(uow, posicao) == 7500


def test_aporte_nao_e_redefinido(unidade_de_trabalho):
    uow = unidade_de_trabalho
    _, posicao, _ = _com_principal(uow)
    with uow as u:
        (aporte,) = [
            m
            for m in u.movimentos_de_investimento.listar(
                PESSOA, date(2026, 10, 1), date(2026, 10, 1)
            )
        ]
    with pytest.raises(MovimentoJaAssociado):
        _definir(uow, aporte, posicao)


def test_resgate_de_outra_posicao_nao_e_trocado(unidade_de_trabalho):
    uow = unidade_de_trabalho
    _, posicao, resgate = _com_principal(uow)
    outra = _posicao(uow, nome="OUTRA", externo="outra")
    with pytest.raises(MovimentoJaAssociado):
        _definir(uow, resgate, outra)


def test_percentuais_que_nao_somam_100_sao_recusados(unidade_de_trabalho):
    uow = unidade_de_trabalho
    _, posicao, resgate = _com_principal(uow)
    with pytest.raises(DestinacaoInvalida):
        _definir(uow, resgate, posicao, [Destinacao(Tag("casa"), 60)])


def test_resgate_ligado_pela_revisao_aceita_caixinhas(unidade_de_trabalho):
    uow = unidade_de_trabalho
    conta = _conta(uow)
    posicao = _posicao(uow)
    aporte = MovimentoDeInvestimento(
        conta.id, TipoDeMovimento.APORTE, Dinheiro(10000), "Aporte", date(2026, 10, 1), posicao.id
    )
    with uow as u:
        u.movimentos_de_investimento.adicionar(aporte)
        u.destinacoes.adicionar(aporte.id, [ParteDeDestinacao(Tag("casa"), Dinheiro(10000))])
        u.commit()
    _operacao(uow, posicao, 5000, tipo=TipoDeOperacao.VENDA)
    _transacao(uow, conta, BRUTO, 5000, "b", sentido=SentidoDaTransacao.ENTRADA)
    (proposta,) = ListarRevisaoDaBolsa(uow).executar(PESSOA).propostas
    ConfirmarPropostasDaBolsa(uow).executar(
        PESSOA, [ItemDeConfirmacao(proposta.proposta.chave, proposta.versao)]
    )
    (resgate,) = [
        m for m in uow.confirmado.movimentos_de_investimento.values() if m.tipo.value == "resgate"
    ]
    assert resgate.transacao_importada_id is not None
    _definir(uow, resgate, posicao)
    with uow as u:
        assert u.destinacoes.do_movimento([resgate.id])[resgate.id][0][0] == Tag("casa")
    assert _principal(uow, posicao) == 5000


def test_remover_apaga_as_partes_e_devolve_o_principal(unidade_de_trabalho):
    uow = unidade_de_trabalho
    _, posicao, resgate = _com_principal(uow)
    _definir(uow, resgate, posicao)
    RemoverCaixinhasDoResgate(uow).executar(PESSOA, resgate.id)
    with uow as u:
        assert u.destinacoes.do_movimento([resgate.id]) == {}
        assert u.movimentos_de_investimento.obter(PESSOA, resgate.id).investimento_id == posicao.id
    assert _principal(uow, posicao) == 10000


def test_remover_sem_partes_e_recusado(unidade_de_trabalho):
    uow = unidade_de_trabalho
    _, _, resgate = _com_principal(uow)
    with pytest.raises(MovimentoNaoDesfazivel):
        RemoverCaixinhasDoResgate(uow).executar(PESSOA, resgate.id)


def test_remover_de_aporte_e_recusado(unidade_de_trabalho):
    uow = unidade_de_trabalho
    _com_principal(uow)
    with uow as u:
        (aporte,) = u.movimentos_de_investimento.listar(
            PESSOA, date(2026, 10, 1), date(2026, 10, 1)
        )
    with pytest.raises(MovimentoNaoDesfazivel):
        RemoverCaixinhasDoResgate(uow).executar(PESSOA, aporte.id)


def test_remover_de_movimento_alheio_e_nao_encontrado(unidade_de_trabalho):
    uow = unidade_de_trabalho
    _, posicao, resgate = _com_principal(uow)
    _definir(uow, resgate, posicao)
    with pytest.raises(MovimentoDeInvestimentoNaoEncontrado):
        RemoverCaixinhasDoResgate(uow).executar(uuid4(), resgate.id)
    with uow as u:
        assert u.destinacoes.do_movimento([resgate.id])


def test_remover_recusa_com_cobertura_dependente(unidade_de_trabalho):
    uow = unidade_de_trabalho
    conta, posicao, resgate = _com_principal(uow)
    _definir(uow, resgate, posicao)
    compra = Gasto(
        conta.id, Dinheiro(3000), "Compra", date(2026, 10, 27), CategoriaDoGasto.LAZER, ()
    )
    with uow as u:
        u.gastos.adicionar(compra)
        u.commit()
    AssociarCompraADestinacao(uow).executar(
        PESSOA, compra.id, "casa", Dinheiro(3000), movimento_id=resgate.id
    )
    with pytest.raises(MovimentoNaoDesfazivel):
        RemoverCaixinhasDoResgate(uow).executar(PESSOA, resgate.id)
    with uow as u:
        assert u.destinacoes.do_movimento([resgate.id])


def test_remover_recusa_com_reaplicacao_dependente(unidade_de_trabalho):
    uow = unidade_de_trabalho
    conta, posicao, resgate = _com_principal(uow)
    _definir(uow, resgate, posicao)
    destino = _posicao(uow, nome="DESTINO", externo="destino")
    aporte = MovimentoDeInvestimento(
        conta.id, TipoDeMovimento.APORTE, Dinheiro(2000), "Aporte", date(2026, 10, 27), destino.id
    )
    with uow as u:
        u.movimentos_de_investimento.adicionar(aporte)
        u.reaplicacoes_de_resgates.adicionar(
            ReaplicacaoDeResgate(resgate.id, aporte.id, Dinheiro(2000))
        )
        u.commit()
    with pytest.raises(MovimentoNaoDesfazivel):
        RemoverCaixinhasDoResgate(uow).executar(PESSOA, resgate.id)


def test_caixinhas_novas_na_posicao_nao_recalculam_o_resgate_antigo(unidade_de_trabalho):
    """Posição sem principal: resgate sem partes. Depois ela ganha caixinhas: o resgate antigo
    continua sem efeito no principal (só definir, de propósito, o altera)."""
    uow = unidade_de_trabalho
    conta = _conta(uow)
    posicao = _posicao(uow)
    resgate = MovimentoDeInvestimento(
        conta.id, TipoDeMovimento.RESGATE, Dinheiro(5000), "Vencimento", DIA_DO_RESGATE, posicao.id
    )
    aporte = MovimentoDeInvestimento(
        conta.id, TipoDeMovimento.APORTE, Dinheiro(8000), "Aporte", date(2026, 10, 28), posicao.id
    )
    with uow as u:
        u.movimentos_de_investimento.adicionar(resgate)
        u.movimentos_de_investimento.adicionar(aporte)
        u.destinacoes.adicionar(aporte.id, [ParteDeDestinacao(Tag("casa"), Dinheiro(8000))])
        u.commit()
    assert _principal(uow, posicao) == 8000
    with uow as u:
        assert u.destinacoes.do_movimento([resgate.id]) == {}
