from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from gastoba.application.alterar_operacao import AlterarOperacao
from gastoba.application.excluir_operacao import ExcluirOperacao
from gastoba.application.lancar_operacao_manual import LancarOperacaoManual
from gastoba.application.listar_operacoes import ListarOperacoes
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    InvestimentoNaoEncontrado,
    OperacaoDaCorretoraImutavel,
    OperacaoInvalida,
    OperacaoNaoEncontrada,
    OperacaoPossivelmenteDuplicada,
)
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.portas import InvestimentoExterno

USUARIO, OUTRO = uuid4(), uuid4()
DIA = date(2026, 11, 3)


def _acao(uow):
    with uow as u:
        u.investimentos.salvar_posicao(
            USUARIO,
            InvestimentoExterno(
                "a", "AUPO11", "EQUITY", None, Dinheiro(369237), '{"quantity": "25"}'
            ),
        )
        u.commit()
    with uow as u:
        return u.investimentos.listar_posicoes(USUARIO)[0]


def _lancar(uow, investimento, tipo=TipoDeOperacao.COMPRA, quantidade="25", valor=278930, **kw):
    return LancarOperacaoManual(uow).executar(
        USUARIO, investimento.id, tipo, DIA, Decimal(quantidade), Dinheiro(valor), **kw
    )


def test_lanca_a_operacao_que_faltava_e_o_historico_fecha(unidade_de_trabalho):
    from gastoba.application.listar_investimentos import ListarInvestimentos

    investimento = _acao(unidade_de_trabalho)
    operacao = _lancar(unidade_de_trabalho, investimento)
    assert operacao.origem == OrigemDaOperacao.MANUAL
    assert operacao.id_externo is None
    (posicao,) = ListarInvestimentos(unidade_de_trabalho).executar(USUARIO, hoje=date(2026, 11, 10))
    assert posicao.historico_completo
    assert posicao.pendencias == ()
    assert posicao.rentabilidade_do_periodo is not None


def test_lanca_taxa_e_imposto_ligados_a_uma_operacao(unidade_de_trabalho):
    investimento = _acao(unidade_de_trabalho)
    compra = _lancar(unidade_de_trabalho, investimento)
    taxa = _lancar(
        unidade_de_trabalho,
        investimento,
        TipoDeOperacao.TAXA,
        "0",
        82,
        operacao_relacionada_id=compra.id,
    )
    assert taxa.operacao_relacionada_id == compra.id
    with pytest.raises(OperacaoInvalida):
        _lancar(unidade_de_trabalho, investimento, TipoDeOperacao.IMPOSTO, "0", 10)


def test_nao_lanca_em_posicao_de_outra_pessoa(unidade_de_trabalho):
    investimento = _acao(unidade_de_trabalho)
    with pytest.raises(InvestimentoNaoEncontrado):
        LancarOperacaoManual(unidade_de_trabalho).executar(
            OUTRO, investimento.id, TipoDeOperacao.COMPRA, DIA, Decimal(1), Dinheiro(100)
        )
    assert ListarOperacoes(unidade_de_trabalho).executar(USUARIO, investimento.id) == []
    with pytest.raises(InvestimentoNaoEncontrado):
        ListarOperacoes(unidade_de_trabalho).executar(OUTRO, investimento.id)


def test_sinaliza_a_possivel_duplicidade_com_a_operacao_da_corretora(unidade_de_trabalho):
    investimento = _acao(unidade_de_trabalho)
    with unidade_de_trabalho as u:
        u.operacoes.adicionar(
            USUARIO,
            Operacao(
                posicao_id=investimento.id,
                tipo=TipoDeOperacao.COMPRA,
                data=DIA,
                quantidade=Decimal("25"),
                valor_bruto=Dinheiro(278930),
                origem=OrigemDaOperacao.PLUGGY,
                id_externo="p1",
            ),
        )
        u.commit()
    with pytest.raises(OperacaoPossivelmenteDuplicada):
        _lancar(unidade_de_trabalho, investimento)
    # A pessoa pode confirmar que é outra operação.
    assert _lancar(unidade_de_trabalho, investimento, confirmar_duplicidade=True)


def test_altera_e_exclui_a_abertura_e_a_manual_mas_nunca_a_da_corretora(unidade_de_trabalho):
    investimento = _acao(unidade_de_trabalho)
    abertura = Operacao(
        posicao_id=investimento.id,
        tipo=TipoDeOperacao.ABERTURA,
        data=DIA,
        quantidade=Decimal("25"),
        valor_bruto=Dinheiro(278925),
        origem=OrigemDaOperacao.ABERTURA,
        quantidade_estimada=True,
    )
    corretora = Operacao(
        posicao_id=investimento.id,
        tipo=TipoDeOperacao.COMPRA,
        data=DIA,
        quantidade=Decimal("1"),
        valor_bruto=Dinheiro(100),
        origem=OrigemDaOperacao.PLUGGY,
        id_externo="p1",
    )
    with unidade_de_trabalho as u:
        u.operacoes.adicionar(USUARIO, abertura)
        u.operacoes.adicionar(USUARIO, corretora)
        u.commit()
    editada = AlterarOperacao(unidade_de_trabalho).executar(
        USUARIO,
        abertura.id,
        data=date(2026, 11, 1),
        quantidade=Decimal("20"),
        valor_bruto=Dinheiro(250000),
    )
    assert editada.quantidade == Decimal("20")
    assert editada.data == date(2026, 11, 1)
    assert not editada.quantidade_estimada  # a pessoa confirmou a quantidade
    with pytest.raises(OperacaoDaCorretoraImutavel):
        AlterarOperacao(unidade_de_trabalho).executar(USUARIO, corretora.id, quantidade=Decimal(2))
    with pytest.raises(OperacaoDaCorretoraImutavel):
        ExcluirOperacao(unidade_de_trabalho).executar(USUARIO, corretora.id)
    ExcluirOperacao(unidade_de_trabalho).executar(USUARIO, abertura.id)
    with unidade_de_trabalho as u:
        assert u.operacoes.obter(USUARIO, abertura.id) is None
        assert u.operacoes.obter(USUARIO, corretora.id) is not None


def test_excluir_a_abertura_volta_ao_historico_incompleto_com_pendencia(unidade_de_trabalho):
    from gastoba.application.listar_investimentos import ListarInvestimentos

    investimento = _acao(unidade_de_trabalho)
    compra = _lancar(unidade_de_trabalho, investimento)
    ExcluirOperacao(unidade_de_trabalho).executar(USUARIO, compra.id)
    (posicao,) = ListarInvestimentos(unidade_de_trabalho).executar(USUARIO, hoje=date(2026, 11, 10))
    assert not posicao.historico_completo
    assert posicao.pendencias[0].tipo.value == "faltam_cotas"


def test_nao_exclui_operacao_com_taxa_ligada_nem_de_outra_pessoa(unidade_de_trabalho):
    investimento = _acao(unidade_de_trabalho)
    compra = _lancar(unidade_de_trabalho, investimento)
    _lancar(
        unidade_de_trabalho,
        investimento,
        TipoDeOperacao.TAXA,
        "0",
        82,
        operacao_relacionada_id=compra.id,
    )
    with pytest.raises(OperacaoInvalida):
        ExcluirOperacao(unidade_de_trabalho).executar(USUARIO, compra.id)
    with pytest.raises(OperacaoNaoEncontrada):
        ExcluirOperacao(unidade_de_trabalho).executar(OUTRO, compra.id)
    with pytest.raises(OperacaoNaoEncontrada):
        AlterarOperacao(unidade_de_trabalho).executar(OUTRO, compra.id, quantidade=Decimal(1))


def test_confirma_so_a_quantidade_da_operacao_da_corretora_que_veio_sem_ela(unidade_de_trabalho):
    investimento = _acao(unidade_de_trabalho)
    estimada = Operacao(
        posicao_id=investimento.id,
        tipo=TipoDeOperacao.COMPRA,
        data=DIA,
        quantidade=Decimal("3"),
        valor_bruto=Dinheiro(45528),
        origem=OrigemDaOperacao.PLUGGY,
        id_externo="p2",
        quantidade_estimada=True,
    )
    with unidade_de_trabalho as u:
        u.operacoes.adicionar(USUARIO, estimada)
        u.commit()
    with pytest.raises(OperacaoDaCorretoraImutavel):
        AlterarOperacao(unidade_de_trabalho).executar(
            USUARIO, estimada.id, quantidade=Decimal("3"), valor_bruto=Dinheiro(1)
        )
    confirmada = AlterarOperacao(unidade_de_trabalho).executar(
        USUARIO, estimada.id, quantidade=Decimal("3"), valor_bruto=Dinheiro(45528)
    )
    assert confirmada.quantidade == Decimal("3") and not confirmada.quantidade_estimada
    assert confirmada.valor_bruto == Dinheiro(45528)
    with pytest.raises(OperacaoDaCorretoraImutavel):  # já confirmada: volta a ser imutável
        AlterarOperacao(unidade_de_trabalho).executar(USUARIO, estimada.id, quantidade=Decimal(4))
