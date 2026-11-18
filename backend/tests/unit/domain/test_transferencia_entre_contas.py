from datetime import date
from uuid import uuid4

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)
from gastoba.domain.transferencia_entre_contas import parear_transferencias

BANKING, INVESTIMENTOS = uuid4(), uuid4()


def t(conta, sentido, centavos=95645, dia=5, estado=EstadoDaTransacaoImportada.PENDENTE):
    return TransacaoImportada(
        conta_id=conta,
        id_externo=uuid4().hex,
        data=date(2026, 11, dia),
        descricao="Transferência",
        valor=Dinheiro(centavos),
        sentido=sentido,
        estado=estado,
    )


def test_saida_e_entrada_de_mesmo_valor_em_contas_diferentes_formam_par():
    saida = t(BANKING, SentidoDaTransacao.SAIDA)
    entrada = t(INVESTIMENTOS, SentidoDaTransacao.ENTRADA, dia=6)
    pares = parear_transferencias([saida, entrada])
    assert pares == {saida.id: entrada.id, entrada.id: saida.id}


def test_mesma_conta_ou_valor_diferente_ou_dias_longe_nao_formam_par():
    saida = t(BANKING, SentidoDaTransacao.SAIDA)
    assert parear_transferencias([saida, t(BANKING, SentidoDaTransacao.ENTRADA)]) == {}
    assert parear_transferencias([saida, t(INVESTIMENTOS, SentidoDaTransacao.ENTRADA, 1)]) == {}
    assert parear_transferencias([saida, t(INVESTIMENTOS, SentidoDaTransacao.ENTRADA, dia=8)]) == {}


def test_ambiguidade_nao_forma_par():
    saida = t(BANKING, SentidoDaTransacao.SAIDA)
    duas_entradas = [
        t(INVESTIMENTOS, SentidoDaTransacao.ENTRADA),
        t(uuid4(), SentidoDaTransacao.ENTRADA),
    ]
    assert parear_transferencias([saida, *duas_entradas]) == {}
    duas_saidas = [saida, t(uuid4(), SentidoDaTransacao.SAIDA)]
    assert parear_transferencias([*duas_saidas, t(INVESTIMENTOS, SentidoDaTransacao.ENTRADA)]) == {}


def test_so_pendentes_entram():
    saida = t(BANKING, SentidoDaTransacao.SAIDA)
    tratada = t(
        INVESTIMENTOS, SentidoDaTransacao.ENTRADA, estado=EstadoDaTransacaoImportada.IGNORADA
    )
    assert parear_transferencias([saida, tratada]) == {}
