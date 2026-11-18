from decimal import Decimal

from gastoba.domain.reconciliacao_de_posicao import (
    TipoDePendencia,
    reconciliar_por_quantidade,
)


def test_quantidades_iguais_fecham_o_historico():
    resultado = reconciliar_por_quantidade(Decimal("25"), Decimal("25"))
    assert resultado.historico_completo
    assert resultado.pendencias == ()


def test_faltam_cotas_gera_pendencia_com_a_quantidade_estimada():
    resultado = reconciliar_por_quantidade(Decimal("25"), Decimal("10"))
    assert not resultado.historico_completo
    (pendencia,) = resultado.pendencias
    assert pendencia.tipo == TipoDePendencia.FALTAM_COTAS
    assert pendencia.quantidade_estimada == Decimal("15")


def test_sobram_cotas_pede_a_venda_nao_registrada():
    resultado = reconciliar_por_quantidade(Decimal("5"), Decimal("10"))
    assert not resultado.historico_completo
    (pendencia,) = resultado.pendencias
    assert pendencia.tipo == TipoDePendencia.SOBRAM_COTAS
    assert pendencia.quantidade_estimada == Decimal("5")


def test_quantidade_observada_desconhecida_deixa_o_historico_incompleto():
    resultado = reconciliar_por_quantidade(None, Decimal("10"))
    assert not resultado.historico_completo
    assert resultado.pendencias == ()


def test_posicao_sem_operacao_e_com_cotas_observadas_falta_tudo():
    resultado = reconciliar_por_quantidade(Decimal("25"), Decimal("0"))
    (pendencia,) = resultado.pendencias
    assert pendencia.tipo == TipoDePendencia.FALTAM_COTAS
    assert pendencia.quantidade_estimada == Decimal("25")


def test_renda_fixa_usa_quantidade_um():
    assert reconciliar_por_quantidade(Decimal("1"), Decimal("1")).historico_completo
    assert not reconciliar_por_quantidade(Decimal("1"), Decimal("0")).historico_completo


def test_posicao_encerrada_fecha_com_zero():
    assert reconciliar_por_quantidade(Decimal("0"), Decimal("0")).historico_completo


def test_diferenca_decimal_pequena_nao_e_ignorada():
    resultado = reconciliar_por_quantidade(Decimal("10.001"), Decimal("10"))
    assert not resultado.historico_completo
    assert resultado.pendencias[0].quantidade_estimada == Decimal("0.001")


def test_quantidade_estimada_nunca_fecha_o_historico():
    from gastoba.domain.reconciliacao_de_posicao import historico_das_operacoes

    assert not historico_das_operacoes(Decimal("25"), Decimal("25"), True).historico_completo
    assert historico_das_operacoes(Decimal("25"), Decimal("25"), False).historico_completo
