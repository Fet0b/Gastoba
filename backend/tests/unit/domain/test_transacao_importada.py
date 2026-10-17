from datetime import date
from uuid import uuid4

import pytest

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import DescricaoInvalida, TransacaoJaTratada, ValorInvalido
from gastoba.domain.transacao_importada import (
    DESCRICAO_PADRAO,
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
    descartar_na_importacao,
)


def transacao(**campos):
    base = {
        "conta_id": uuid4(),
        "id_externo": "abc",
        "data": date(2026, 10, 10),
        "descricao": "Mercado",
        "valor": Dinheiro(2590),
        "sentido": SentidoDaTransacao.SAIDA,
    }
    base.update(campos)
    return TransacaoImportada(**base)


def test_nasce_pendente():
    assert transacao().estado == EstadoDaTransacaoImportada.PENDENTE


def test_descricao_e_aparada_e_limitada_a_200_caracteres():
    assert transacao(descricao="  Mercado  ").descricao == "Mercado"
    assert len(transacao(descricao="x" * 500).descricao) == 200


def test_descricao_vazia_vira_o_texto_padrao():
    assert transacao(descricao="   ").descricao == DESCRICAO_PADRAO


def test_valor_precisa_ser_positivo():
    with pytest.raises(ValorInvalido):
        transacao(valor=Dinheiro(0))
    with pytest.raises(ValorInvalido):
        transacao(valor=Dinheiro(-5))


def test_id_externo_nao_pode_ser_vazio():
    with pytest.raises(DescricaoInvalida):
        transacao(id_externo="  ")


@pytest.mark.parametrize(
    "operacao", ["PAGAMENTO_FATURA", "TRANSFERENCIA_MESMA_INSTITUICAO", "ESTORNO"]
)
def test_sugere_descartar_o_que_nao_e_gasto_nem_renda(operacao):
    assert transacao(tipo_de_operacao=operacao).sugerir_descarte is True


@pytest.mark.parametrize("operacao", [None, "PIX", "BOLETO", "CARTAO", "FOLHA_PAGAMENTO"])
def test_nao_sugere_descartar_as_demais(operacao):
    assert transacao(tipo_de_operacao=operacao).sugerir_descarte is False


def test_aceitar_e_ignorar_so_valem_uma_vez():
    aceita = transacao()
    aceita.aceitar()
    assert aceita.estado == EstadoDaTransacaoImportada.ACEITA
    with pytest.raises(TransacaoJaTratada):
        aceita.ignorar()
    with pytest.raises(TransacaoJaTratada):
        aceita.aceitar()

    ignorada = transacao()
    ignorada.ignorar()
    assert ignorada.estado == EstadoDaTransacaoImportada.IGNORADA
    with pytest.raises(TransacaoJaTratada):
        ignorada.aceitar()


def test_igualdade_e_pelo_id():
    a = transacao()
    assert a == a
    assert a != transacao()


@pytest.mark.parametrize("operacao", ["TRANSFERENCIA_MESMA_INSTITUICAO", "PAGAMENTO_FATURA"])
def test_transferencia_e_pagamento_de_fatura_sao_descartados_na_importacao(operacao):
    assert descartar_na_importacao(operacao) is True


@pytest.mark.parametrize("operacao", ["ESTORNO", None, "PIX", "OPERACAO_DESCONHECIDA"])
def test_estorno_e_as_demais_operacoes_nao_sao_descartados_na_importacao(operacao):
    assert descartar_na_importacao(operacao) is False
