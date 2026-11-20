"""Realocar entre caixinhas numa posição por fração (072, defeito relatado pelo dono).

Antes da correção, ``RealocarDestinacao`` gravava contra o principal legado e não mexia nos
pesos: a divisão mostrada em Investimentos não mudava. O primeiro teste reproduz o defeito.
"""

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from gastoba.application.desfazer_realocacao import DesfazerRealocacao
from gastoba.application.listar_investimentos import ListarInvestimentos
from gastoba.application.listar_realocacoes import ListarRealocacoes
from gastoba.application.realocar_destinacao import RealocarDestinacao
from gastoba.domain.alocacao_de_caixinha import AlocacaoDeCaixinha
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    DestinacaoInvalida,
    InvestimentoNaoEncontrado,
    PrincipalInsuficiente,
    RealocacaoNaoEncontrada,
)
from gastoba.domain.investimento import Realocacao
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag

USUARIO, OUTRO = uuid4(), uuid4()
RESERVA, VIAGEM, CELULAR = Tag("reserva"), Tag("viagem"), Tag("celular")
HOJE = date(2026, 11, 10)


def _posicao_por_fracao(uow, saldo=100000, custo=100000):
    ids = {RESERVA: uuid4(), VIAGEM: uuid4(), CELULAR: uuid4()}
    for tag, id_da_tag in ids.items():
        uow.confirmado.tags_cadastradas[(USUARIO, tag)] = id_da_tag
    with uow as u:
        u.investimentos.salvar_posicao(
            USUARIO, InvestimentoExterno("cdb", "CDB", "FIXED_INCOME", "CDB", Dinheiro(saldo), "{}")
        )
        u.commit()
    with uow as u:
        cdb = u.investimentos.listar_posicoes(USUARIO)[0]
        u.alocacoes.substituir(
            USUARIO,
            cdb.id,
            [
                AlocacaoDeCaixinha(cdb.id, ids[RESERVA], 60000),
                AlocacaoDeCaixinha(cdb.id, ids[VIAGEM], 40000),
            ],
        )
        u.operacoes.adicionar(
            USUARIO,
            Operacao(
                posicao_id=cdb.id,
                tipo=TipoDeOperacao.COMPRA,
                data=date(2026, 10, 1),
                quantidade=Decimal("1"),
                valor_bruto=Dinheiro(custo),
                origem=OrigemDaOperacao.MANUAL,
            ),
        )
        u.commit()
    return cdb


def _valores(uow):
    (posicao,) = ListarInvestimentos(uow).executar(USUARIO, hoje=HOJE)
    return {d.tag: d.valor_atual for d in posicao.destinacoes}


def test_realocar_numa_posicao_por_fracao_muda_a_divisao_mostrada(unidade_de_trabalho):
    cdb = _posicao_por_fracao(unidade_de_trabalho)
    RealocarDestinacao(unidade_de_trabalho).executar(
        USUARIO, cdb.id, "reserva", "viagem", HOJE, valor=Dinheiro(15000)
    )
    assert _valores(unidade_de_trabalho) == {RESERVA: Dinheiro(45000), VIAGEM: Dinheiro(55000)}


def _realocar(uow, cdb, origem, destino, **valor):
    return RealocarDestinacao(uow).executar(USUARIO, cdb.id, origem, destino, HOJE, **valor)


def _pesos(uow, cdb):
    ids = {v: k for k, v in uow.confirmado.tags_cadastradas.items()}
    return {ids[a.destinacao_id][1]: a.peso_centavos for a in uow.confirmado.alocacoes[cdb.id]}


def test_realocar_move_o_peso_sem_mudar_o_total_nem_a_parte_sem_caixinha(unidade_de_trabalho):
    cdb = _posicao_por_fracao(unidade_de_trabalho, saldo=110000, custo=110000)
    antes = _valores(unidade_de_trabalho)
    _realocar(unidade_de_trabalho, cdb, "reserva", "viagem", valor=Dinheiro(15000))
    depois = _valores(unidade_de_trabalho)
    assert _pesos(unidade_de_trabalho, cdb) == {RESERVA: 45000, VIAGEM: 55000}
    assert depois[None] == antes[None] == Dinheiro(10000)
    assert sum(v.centavos for v in depois.values()) == sum(v.centavos for v in antes.values())


def test_realocar_por_percentual_usa_o_peso_da_origem(unidade_de_trabalho):
    cdb = _posicao_por_fracao(unidade_de_trabalho)
    _realocar(unidade_de_trabalho, cdb, "reserva", "celular", percentual=25)
    assert _pesos(unidade_de_trabalho, cdb) == {RESERVA: 45000, VIAGEM: 40000, CELULAR: 15000}


def test_realocar_todo_o_peso_tira_a_origem(unidade_de_trabalho):
    cdb = _posicao_por_fracao(unidade_de_trabalho)
    _realocar(unidade_de_trabalho, cdb, "viagem", "reserva", percentual=100)
    assert _pesos(unidade_de_trabalho, cdb) == {RESERVA: 100000}
    assert set(_valores(unidade_de_trabalho)) == {RESERVA}


def test_realocar_grava_a_mudanca_e_nao_o_historico_legado(unidade_de_trabalho):
    cdb = _posicao_por_fracao(unidade_de_trabalho)
    realocacao = _realocar(unidade_de_trabalho, cdb, "reserva", "viagem", valor=Dinheiro(100))
    (mudanca,) = unidade_de_trabalho.confirmado.mudancas_de_fracao.values()
    assert (mudanca.id, mudanca.origem, mudanca.destino, mudanca.valor, mudanca.data) == (
        realocacao.id,
        RESERVA,
        VIAGEM,
        Dinheiro(100),
        HOJE,
    )
    assert unidade_de_trabalho.confirmado.realocacoes == {}


def test_realocar_na_fracao_recusa_o_que_passa_das_regras(unidade_de_trabalho):
    cdb = _posicao_por_fracao(unidade_de_trabalho)
    with pytest.raises(PrincipalInsuficiente):
        _realocar(unidade_de_trabalho, cdb, "reserva", "viagem", valor=Dinheiro(60001))
    with pytest.raises(PrincipalInsuficiente):
        _realocar(unidade_de_trabalho, cdb, "celular", "viagem", valor=Dinheiro(1))
    with pytest.raises(DestinacaoInvalida):
        _realocar(unidade_de_trabalho, cdb, "reserva", "inexistente", valor=Dinheiro(1))
    with pytest.raises(DestinacaoInvalida):
        _realocar(unidade_de_trabalho, cdb, "reserva", "reserva", valor=Dinheiro(1))
    with pytest.raises(DestinacaoInvalida):
        _realocar(unidade_de_trabalho, cdb, "reserva", "viagem", valor=Dinheiro(1), percentual=1)
    with pytest.raises(InvestimentoNaoEncontrado):
        RealocarDestinacao(unidade_de_trabalho).executar(
            OUTRO, cdb.id, "reserva", "viagem", HOJE, valor=Dinheiro(1)
        )
    assert _pesos(unidade_de_trabalho, cdb) == {RESERVA: 60000, VIAGEM: 40000}
    assert unidade_de_trabalho.confirmado.mudancas_de_fracao == {}


def test_desfazer_na_fracao_devolve_o_peso_e_apaga_a_mudanca(unidade_de_trabalho):
    cdb = _posicao_por_fracao(unidade_de_trabalho)
    realocacao = _realocar(unidade_de_trabalho, cdb, "reserva", "celular", valor=Dinheiro(20000))
    DesfazerRealocacao(unidade_de_trabalho).executar(USUARIO, cdb.id, realocacao.id)
    assert _pesos(unidade_de_trabalho, cdb) == {RESERVA: 60000, VIAGEM: 40000}
    assert unidade_de_trabalho.confirmado.mudancas_de_fracao == {}


def test_nao_desfaz_na_fracao_se_o_destino_ja_nao_tem_o_peso(unidade_de_trabalho):
    cdb = _posicao_por_fracao(unidade_de_trabalho)
    primeira = _realocar(unidade_de_trabalho, cdb, "reserva", "celular", valor=Dinheiro(20000))
    _realocar(unidade_de_trabalho, cdb, "celular", "viagem", valor=Dinheiro(15000))
    with pytest.raises(PrincipalInsuficiente):
        DesfazerRealocacao(unidade_de_trabalho).executar(USUARIO, cdb.id, primeira.id)
    assert _pesos(unidade_de_trabalho, cdb) == {RESERVA: 40000, VIAGEM: 55000, CELULAR: 5000}
    assert len(unidade_de_trabalho.confirmado.mudancas_de_fracao) == 2


def test_desfazer_na_fracao_de_outra_pessoa_ou_de_outra_posicao(unidade_de_trabalho):
    cdb = _posicao_por_fracao(unidade_de_trabalho)
    realocacao = _realocar(unidade_de_trabalho, cdb, "reserva", "celular", valor=Dinheiro(100))
    with pytest.raises(InvestimentoNaoEncontrado):
        DesfazerRealocacao(unidade_de_trabalho).executar(OUTRO, cdb.id, realocacao.id)
    with pytest.raises(RealocacaoNaoEncontrada):
        DesfazerRealocacao(unidade_de_trabalho).executar(USUARIO, cdb.id, uuid4())
    assert len(unidade_de_trabalho.confirmado.mudancas_de_fracao) == 1


def test_listar_junta_as_realocacoes_da_fracao_e_as_antigas_por_data(unidade_de_trabalho):
    cdb = _posicao_por_fracao(unidade_de_trabalho)
    # D3: a realocação antiga, gravada antes da correção, fica no histórico sem mexer na fração.
    antiga = Realocacao(cdb.id, RESERVA, VIAGEM, Dinheiro(500), date(2026, 10, 20))
    unidade_de_trabalho.confirmado.realocacoes[antiga.id] = antiga
    nova = _realocar(unidade_de_trabalho, cdb, "reserva", "celular", valor=Dinheiro(100))
    lista = ListarRealocacoes(unidade_de_trabalho).executar(USUARIO, cdb.id)
    assert [(r.id, r.origem, r.destino, r.valor, r.data) for r in lista] == [
        (nova.id, RESERVA, CELULAR, Dinheiro(100), HOJE),
        (antiga.id, RESERVA, VIAGEM, Dinheiro(500), date(2026, 10, 20)),
    ]
    assert _pesos(unidade_de_trabalho, cdb) == {RESERVA: 59900, VIAGEM: 40000, CELULAR: 100}


def test_desfazer_a_realocacao_antiga_da_fracao_segue_a_regra_legada(unidade_de_trabalho):
    cdb = _posicao_por_fracao(unidade_de_trabalho)
    antiga = Realocacao(cdb.id, RESERVA, VIAGEM, Dinheiro(500), date(2026, 10, 20))
    unidade_de_trabalho.confirmado.realocacoes[antiga.id] = antiga
    # D3: desfazer a antiga só apaga o registro legado; a fração não muda.
    DesfazerRealocacao(unidade_de_trabalho).executar(USUARIO, cdb.id, antiga.id)
    assert unidade_de_trabalho.confirmado.realocacoes == {}
    assert _pesos(unidade_de_trabalho, cdb) == {RESERVA: 60000, VIAGEM: 40000}
