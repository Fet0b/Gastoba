from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.classificar_transferencia import ClassificarTransferencia
from gastoba.application.completar_par_da_transferencia import CompletarParDaTransferencia
from gastoba.domain.conta import Conta, OrigemDaConta, PapelDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import TransacaoImportadaInvalida
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada


def montar(uow):
    pessoa = uuid4()
    corrente = Conta(
        pessoa,
        "Corrente",
        Dinheiro(10000),
        origem=OrigemDaConta.OPEN_FINANCE,
        papel=PapelDaConta.CORRENTE,
    )
    investimento = Conta(
        pessoa,
        "Corretora",
        Dinheiro(30000),
        origem=OrigemDaConta.OPEN_FINANCE,
        papel=PapelDaConta.INVESTIMENTO,
    )
    saida = TransacaoImportada(
        corrente.id,
        "s",
        date(2026, 10, 31),
        "Transferência",
        Dinheiro(30000),
        SentidoDaTransacao.SAIDA,
    )
    entrada = TransacaoImportada(
        investimento.id,
        "e",
        date(2026, 11, 1),
        "Transferência",
        Dinheiro(30000),
        SentidoDaTransacao.ENTRADA,
    )
    with uow as u:
        for c in (corrente, investimento):
            u.contas.adicionar(c)
        for t in (saida, entrada):
            u.transacoes_importadas.adicionar_se_nova(t)
        u.commit()
    return pessoa, corrente, investimento, saida, entrada


def test_par_e_um_unico_fluxo_no_mes_do_investimento_sem_gasto_ganho(unidade_de_trabalho):
    uow = unidade_de_trabalho
    pessoa, corrente, inv, saida, entrada = montar(uow)
    t = ClassificarTransferencia(uow).executar(pessoa, saida.id, inv.id, entrada.id)
    assert t.data == date(2026, 11, 1) and not t.competencia_provisoria
    assert t.aporte_liquido == Dinheiro(30000)
    assert not uow.confirmado.gastos and not uow.confirmado.ganhos
    assert len(uow.confirmado.transferencias) == 1
    assert uow.confirmado.contas[corrente.id].saldo == Dinheiro(10000)
    assert all(t.estado == "aceita" for t in uow.confirmado.transacoes_importadas.values())
    with pytest.raises(TransacaoImportadaInvalida):
        ClassificarTransferencia(uow).executar(pessoa, entrada.id, corrente.id, saida.id)
    assert len(uow.confirmado.transferencias) == 1


def test_ponta_ausente_completa_o_mesmo_registro_sem_contar_duas_vezes(unidade_de_trabalho):
    uow = unidade_de_trabalho
    pessoa, _, inv, saida, entrada = montar(uow)
    caso = ClassificarTransferencia(uow)
    t = caso.executar(pessoa, saida.id, inv.id)
    assert t.competencia_provisoria and t.data == date(2026, 10, 31)
    completo = CompletarParDaTransferencia(uow).executar(pessoa, t.id, entrada.id)
    assert completo.id == t.id and completo.data == date(2026, 11, 1)
    assert not completo.competencia_provisoria and len(uow.confirmado.transferencias) == 1


def test_papear_outro_valor_ou_outra_pessoa_nao_aceita_nenhuma_ponta(unidade_de_trabalho):
    uow = unidade_de_trabalho
    pessoa, _, inv, saida, entrada = montar(uow)
    uow.confirmado.transacoes_importadas[entrada.id].valor = Dinheiro(29999)
    with pytest.raises(TransacaoImportadaInvalida):
        ClassificarTransferencia(uow).executar(pessoa, saida.id, inv.id, entrada.id)
    assert not uow.confirmado.transferencias
    assert all(t.estado == "pendente" for t in uow.confirmado.transacoes_importadas.values())
