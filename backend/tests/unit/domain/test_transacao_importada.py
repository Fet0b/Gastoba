from datetime import date
from uuid import uuid4

import pytest

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import DescricaoInvalida, TransacaoJaTratada, ValorInvalido
from gastoba.domain.transacao_importada import (
    DESCRICAO_PADRAO,
    EstadoDaTransacaoImportada,
    MotivoDaTransacaoIgnorada,
    SentidoDaTransacao,
    TransacaoImportada,
    descartar_na_importacao,
    motivo_do_descarte_na_importacao,
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


def test_restaurar_volta_a_ignorada_para_pendente_e_preserva_os_demais_campos():
    ignorada = transacao(tipo_de_operacao="PIX")
    ignorada.ignorar()
    antes = (
        ignorada.id,
        ignorada.conta_id,
        ignorada.id_externo,
        ignorada.data,
        ignorada.descricao,
        ignorada.valor,
        ignorada.sentido,
        ignorada.tipo_de_operacao,
    )

    ignorada.restaurar()

    assert ignorada.estado == EstadoDaTransacaoImportada.PENDENTE
    assert antes == (
        ignorada.id,
        ignorada.conta_id,
        ignorada.id_externo,
        ignorada.data,
        ignorada.descricao,
        ignorada.valor,
        ignorada.sentido,
        ignorada.tipo_de_operacao,
    )


@pytest.mark.parametrize(
    "estado", [EstadoDaTransacaoImportada.PENDENTE, EstadoDaTransacaoImportada.ACEITA]
)
def test_restaurar_so_vale_para_ignorada(estado):
    t = transacao()
    t.estado = estado

    with pytest.raises(TransacaoJaTratada):
        t.restaurar()

    assert t.estado == estado


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


@pytest.mark.parametrize("estado", list(EstadoDaTransacaoImportada))
def test_reabrir_so_aceita_e_preserva_os_demais_campos(estado):
    from dataclasses import asdict

    from gastoba.domain.excecoes import MovimentoNaoDesfazivel

    t = transacao(estado=estado)
    antes = asdict(t)
    if estado == EstadoDaTransacaoImportada.ACEITA:
        t.reabrir()
        assert t.estado == EstadoDaTransacaoImportada.PENDENTE
        antes["estado"] = EstadoDaTransacaoImportada.PENDENTE
    else:
        with pytest.raises(MovimentoNaoDesfazivel):
            t.reabrir()
    assert asdict(t) == antes


ESPELHOS = [
    "CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA",
    "CONTA REMUNERADA - RESGATE APLICAÇÃO",
    "Aplicacao automatica",
    "RESGATE AUTOMATICO",
]


@pytest.mark.parametrize("descricao", ESPELHOS)
@pytest.mark.parametrize(
    "operacao", [None, "RESGATE_APLIC_FINANCEIRA", "TRANSFERENCIA_MESMA_INSTITUICAO"]
)
def test_o_espelho_da_conta_investimentos_entra_ignorado_com_motivo_proprio(descricao, operacao):
    assert (
        motivo_do_descarte_na_importacao(operacao, descricao)
        == MotivoDaTransacaoIgnorada.MOVIMENTO_INTERNO_DA_CONTA
    )
    assert descartar_na_importacao(operacao, descricao) is True


@pytest.mark.parametrize(
    "descricao",
    [
        "EMISSAO - CDB BANCO FICTICIO",
        "REMUNERACAO APLICACAO AUTOMATICA",
        "Mercado",
    ],
)
def test_emissao_rendimento_e_gasto_comum_nao_sao_espelho_mesmo_com_o_tipo_do_resgate(descricao):
    assert motivo_do_descarte_na_importacao("RESGATE_APLIC_FINANCEIRA", descricao) is None
    assert descartar_na_importacao("RESGATE_APLIC_FINANCEIRA", descricao) is False


@pytest.mark.parametrize("operacao", ["TRANSFERENCIA_MESMA_INSTITUICAO", "PAGAMENTO_FATURA"])
def test_os_tipos_ja_descartados_continuam_sem_motivo(operacao):
    assert motivo_do_descarte_na_importacao(operacao, "Pix fictício") is None
    assert descartar_na_importacao(operacao, "Pix fictício") is True


def test_restaurar_o_movimento_interno_da_conta_e_recusado():
    espelho = transacao(
        descricao="CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA",
        estado=EstadoDaTransacaoImportada.IGNORADA,
        motivo_ignorada=MotivoDaTransacaoIgnorada.MOVIMENTO_INTERNO_DA_CONTA,
    )

    with pytest.raises(TransacaoJaTratada):
        espelho.restaurar()

    assert espelho.estado == EstadoDaTransacaoImportada.IGNORADA
    assert espelho.motivo_ignorada == MotivoDaTransacaoIgnorada.MOVIMENTO_INTERNO_DA_CONTA


def test_exigir_pendente_recusa_a_transacao_ja_tratada():
    transacao = TransacaoImportada(
        uuid4(), "x1", date(2026, 11, 1), "Mercado", Dinheiro(1000), SentidoDaTransacao.SAIDA
    )
    transacao.exigir_pendente()
    transacao.ignorar()
    with pytest.raises(TransacaoJaTratada):
        transacao.exigir_pendente()


def _aceita(descricao):
    transacao = TransacaoImportada(
        uuid4(), "x2", date(2026, 11, 1), descricao, Dinheiro(1000), SentidoDaTransacao.SAIDA
    )
    transacao.aceitar()
    return transacao


def test_devolver_a_caixa_reabre_a_comum_e_ignora_o_movimento_interno():
    comum = _aceita("Mercado")
    comum.devolver_a_caixa()
    assert comum.estado.value == "pendente" and comum.motivo_ignorada is None

    interno = _aceita("CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA")
    interno.devolver_a_caixa()
    assert interno.estado.value == "ignorada"
    assert interno.motivo_ignorada == MotivoDaTransacaoIgnorada.MOVIMENTO_INTERNO_DA_CONTA

    interno.reaceitar()
    assert interno.estado.value == "aceita" and interno.motivo_ignorada is None
    comum.reaceitar()
    assert comum.estado.value == "aceita"
