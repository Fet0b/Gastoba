from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import OperacaoInvalida
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao


def _operacao(**mudancas):
    base = dict(
        posicao_id=uuid4(),
        tipo=TipoDeOperacao.COMPRA,
        data=date(2026, 11, 3),
        quantidade=Decimal("25"),
        valor_bruto=Dinheiro(278930),
        origem=OrigemDaOperacao.PLUGGY,
        id_externo="pl-1",
    )
    base.update(mudancas)
    return Operacao(**base)


def test_aceita_todos_os_tipos():
    assert {t.value for t in TipoDeOperacao} == {
        "COMPRA",
        "VENDA",
        "PROVENTO",
        "TAXA",
        "IMPOSTO",
        "VENCIMENTO",
        "ABERTURA",
    }


def test_compra_valida_tem_custos_zero_por_padrao():
    operacao = _operacao()
    assert operacao.custos == Dinheiro(0)
    assert operacao.quantidade == Decimal("25")


def test_quantidade_negativa_e_recusada():
    with pytest.raises(OperacaoInvalida):
        _operacao(quantidade=Decimal("-1"))


def test_valor_bruto_negativo_e_recusado():
    with pytest.raises(OperacaoInvalida):
        _operacao(valor_bruto=Dinheiro(-1))


def test_custos_negativos_sao_recusados():
    with pytest.raises(OperacaoInvalida):
        _operacao(custos=Dinheiro(-1))


def test_quantidade_nunca_aceita_float():
    with pytest.raises(OperacaoInvalida):
        _operacao(quantidade=2.5)


def test_abertura_nao_tem_id_externo():
    with pytest.raises(OperacaoInvalida):
        _operacao(tipo=TipoDeOperacao.ABERTURA, origem=OrigemDaOperacao.ABERTURA, id_externo="x")


def test_abertura_valida_sem_id_externo():
    operacao = _operacao(
        tipo=TipoDeOperacao.ABERTURA, origem=OrigemDaOperacao.ABERTURA, id_externo=None
    )
    assert operacao.id_externo is None


def test_operacao_da_corretora_exige_id_externo():
    with pytest.raises(OperacaoInvalida):
        _operacao(origem=OrigemDaOperacao.PLUGGY, id_externo=None)


def test_taxa_e_imposto_exigem_operacao_relacionada():
    for tipo in (TipoDeOperacao.TAXA, TipoDeOperacao.IMPOSTO):
        with pytest.raises(OperacaoInvalida):
            _operacao(tipo=tipo, operacao_relacionada_id=None)
        assert _operacao(tipo=tipo, operacao_relacionada_id=uuid4()).tipo == tipo


def test_so_corretora_e_imutavel():
    assert _operacao().imutavel_pela_pessoa
    manual = _operacao(origem=OrigemDaOperacao.MANUAL, id_externo=None)
    assert not manual.imutavel_pela_pessoa
