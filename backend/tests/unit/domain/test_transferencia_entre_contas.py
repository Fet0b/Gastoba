from datetime import date
from uuid import uuid4

from gastoba.domain.conta import PapelDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)
from gastoba.domain.transferencia_entre_contas import (
    TransferenciaEntreContas,
    parear_transferencias,
    sugerir_transferencias_a_completar,
)

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


# --- 069 (R5): a ponta que chega depois de uma transferência classificada só com uma ---


def incompleta(origem=BANKING, destino=INVESTIMENTOS, centavos=95645, dia=5, com_saida=True):
    ponta = uuid4()
    return TransferenciaEntreContas(
        uuid4(),
        origem,
        destino,
        Dinheiro(centavos),
        date(2026, 11, dia),
        PapelDaConta.CORRENTE,
        PapelDaConta.INVESTIMENTO,
        transacao_origem_id=ponta if com_saida else None,
        transacao_destino_id=None if com_saida else ponta,
    )


def test_uma_incompleta_compativel_gera_sugestao_para_a_ponta_que_falta():
    transferencia = incompleta()
    entrada = t(INVESTIMENTOS, SentidoDaTransacao.ENTRADA, dia=6)
    assert sugerir_transferencias_a_completar([entrada], [transferencia]) == {
        entrada.id: transferencia.id
    }


def test_a_ponta_que_falta_pode_ser_a_saida():
    transferencia = incompleta(com_saida=False)
    saida = t(BANKING, SentidoDaTransacao.SAIDA)
    assert sugerir_transferencias_a_completar([saida], [transferencia]) == {
        saida.id: transferencia.id
    }


def test_duas_incompletas_compativeis_ou_duas_pontas_candidatas_nao_sugerem_nada():
    entrada = t(INVESTIMENTOS, SentidoDaTransacao.ENTRADA)
    assert sugerir_transferencias_a_completar([entrada], [incompleta(), incompleta()]) == {}
    outra = t(INVESTIMENTOS, SentidoDaTransacao.ENTRADA)
    assert sugerir_transferencias_a_completar([entrada, outra], [incompleta()]) == {}


def test_conta_sentido_valor_ou_data_fora_da_janela_nao_sugerem():
    transferencia = incompleta()
    for ponta in (
        t(BANKING, SentidoDaTransacao.ENTRADA),
        t(INVESTIMENTOS, SentidoDaTransacao.SAIDA),
        t(INVESTIMENTOS, SentidoDaTransacao.ENTRADA, centavos=1),
        t(INVESTIMENTOS, SentidoDaTransacao.ENTRADA, dia=8),
        t(INVESTIMENTOS, SentidoDaTransacao.ENTRADA, estado=EstadoDaTransacaoImportada.ACEITA),
    ):
        assert sugerir_transferencias_a_completar([ponta], [transferencia]) == {}


def test_transferencia_completa_ou_inativa_nao_entra():
    completa = incompleta()
    completa.transacao_destino_id = uuid4()
    inativa = incompleta()
    inativa.ativa = False
    entrada = t(INVESTIMENTOS, SentidoDaTransacao.ENTRADA)
    assert sugerir_transferencias_a_completar([entrada], [completa, inativa]) == {}
