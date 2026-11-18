from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.definir_destinacoes_do_investimento import (
    DefinirDestinacoesDoInvestimento,
)
from gastoba.application.desfazer_realocacao import DesfazerRealocacao
from gastoba.application.desfazer_saldo_inicial import DesfazerSaldoInicial
from gastoba.application.realocar_destinacao import RealocarDestinacao
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    InvestimentoNaoEncontrado,
    MovimentoDeInvestimentoNaoEncontrado,
    MovimentoNaoDesfazivel,
    PrincipalInsuficiente,
    RealocacaoNaoEncontrada,
)
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag

USUARIO = uuid4()
OUTRO = uuid4()
HOJE = date(2026, 10, 12)


def montar(uow):
    externo = InvestimentoExterno(
        "cdb", "CDB", "FIXED_INCOME", "CDB", Dinheiro(40095), "{}", valor_aplicado=Dinheiro(40000)
    )
    with uow as u:
        u.investimentos.salvar_posicao(USUARIO, externo)
        u.commit()
    with uow as u:
        return u.investimentos.listar_posicoes(USUARIO)[0]


def principais(uow, investimento):
    with uow as u:
        por_tag = u.destinacoes.principais(USUARIO).get(investimento.id, {})
    return {str(tag): valor.centavos for tag, valor in por_tag.items()}


def definir(uow, relogio, investimento, **percentuais):
    destinos = [Destinacao(Tag.de_texto(t), p) for t, p in percentuais.items()]
    return DefinirDestinacoesDoInvestimento(uow, relogio).executar(
        USUARIO, investimento.id, destinos
    )


def realocar(uow, investimento, origem, destino, valor):
    return RealocarDestinacao(uow).executar(
        USUARIO, investimento.id, origem, destino, HOJE, valor=Dinheiro(valor)
    )


def test_desfazer_a_realocacao_devolve_o_principal_a_origem(unidade_de_trabalho, relogio):
    investimento = montar(unidade_de_trabalho)
    definir(unidade_de_trabalho, relogio, investimento, computador=100)
    realocacao = realocar(unidade_de_trabalho, investimento, "computador", "celular", 40000)
    assert principais(unidade_de_trabalho, investimento) == {"celular": 40000}

    DesfazerRealocacao(unidade_de_trabalho).executar(USUARIO, investimento.id, realocacao.id)

    assert principais(unidade_de_trabalho, investimento) == {"computador": 40000}
    with unidade_de_trabalho as u:
        assert u.destinacoes.listar_realocacoes(USUARIO, investimento.id) == []


def test_nao_desfaz_realocacao_se_o_destino_ja_gastou_o_valor(unidade_de_trabalho, relogio):
    investimento = montar(unidade_de_trabalho)
    definir(unidade_de_trabalho, relogio, investimento, computador=100)
    primeira = realocar(unidade_de_trabalho, investimento, "computador", "celular", 40000)
    realocar(unidade_de_trabalho, investimento, "celular", "viagem", 30000)

    with pytest.raises(PrincipalInsuficiente):
        DesfazerRealocacao(unidade_de_trabalho).executar(USUARIO, investimento.id, primeira.id)

    assert principais(unidade_de_trabalho, investimento) == {"celular": 10000, "viagem": 30000}


def test_desfazer_realocacao_inexistente_ou_de_outra_pessoa(unidade_de_trabalho, relogio):
    investimento = montar(unidade_de_trabalho)
    definir(unidade_de_trabalho, relogio, investimento, computador=100)
    realocacao = realocar(unidade_de_trabalho, investimento, "computador", "celular", 1000)

    with pytest.raises(RealocacaoNaoEncontrada):
        DesfazerRealocacao(unidade_de_trabalho).executar(USUARIO, investimento.id, uuid4())
    with pytest.raises(InvestimentoNaoEncontrado):
        DesfazerRealocacao(unidade_de_trabalho).executar(OUTRO, investimento.id, realocacao.id)

    assert principais(unidade_de_trabalho, investimento) == {"celular": 1000, "computador": 39000}


def test_desfazer_o_saldo_inicial_tira_o_principal_e_o_movimento(unidade_de_trabalho, relogio):
    investimento = montar(unidade_de_trabalho)
    movimento = definir(unidade_de_trabalho, relogio, investimento, computador=100)

    DesfazerSaldoInicial(unidade_de_trabalho).executar(USUARIO, movimento.movimento.id)

    assert principais(unidade_de_trabalho, investimento) == {}
    estado = unidade_de_trabalho.confirmado
    assert estado.movimentos_de_investimento == {}
    assert estado.destinacoes == []
    # Sobrou valor a destinar de novo: dá para definir outra vez.
    definir(unidade_de_trabalho, relogio, investimento, celular=100)
    assert principais(unidade_de_trabalho, investimento) == {"celular": 40000}


def test_nao_desfaz_saldo_inicial_que_ja_foi_realocado(unidade_de_trabalho, relogio):
    investimento = montar(unidade_de_trabalho)
    movimento = definir(unidade_de_trabalho, relogio, investimento, computador=100)
    realocar(unidade_de_trabalho, investimento, "computador", "celular", 40000)

    with pytest.raises(PrincipalInsuficiente):
        DesfazerSaldoInicial(unidade_de_trabalho).executar(USUARIO, movimento.movimento.id)

    assert len(unidade_de_trabalho.confirmado.movimentos_de_investimento) == 1


def test_so_o_saldo_inicial_pode_ser_desfeito_e_so_pelo_dono(unidade_de_trabalho, relogio):
    investimento = montar(unidade_de_trabalho)
    conta = Conta(USUARIO, "Banco", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE)
    aporte = MovimentoDeInvestimento(
        conta.id, TipoDeMovimento.APORTE, Dinheiro(1000), "Aplicação", HOJE
    )
    with unidade_de_trabalho as u:
        u.contas.adicionar(conta)
        u.movimentos_de_investimento.adicionar(aporte)
        u.commit()
    saldo_inicial = definir(unidade_de_trabalho, relogio, investimento, casa=100)

    with pytest.raises(MovimentoNaoDesfazivel):
        DesfazerSaldoInicial(unidade_de_trabalho).executar(USUARIO, aporte.id)
    with pytest.raises(MovimentoDeInvestimentoNaoEncontrado):
        DesfazerSaldoInicial(unidade_de_trabalho).executar(OUTRO, saldo_inicial.movimento.id)
    with pytest.raises(MovimentoDeInvestimentoNaoEncontrado):
        DesfazerSaldoInicial(unidade_de_trabalho).executar(USUARIO, uuid4())

    assert len(unidade_de_trabalho.confirmado.movimentos_de_investimento) == 2
