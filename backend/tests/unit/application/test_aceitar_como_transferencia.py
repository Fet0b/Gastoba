from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.classificar_transferencia import ClassificarTransferencia
from gastoba.application.listar_transacoes_importadas import ListarTransacoesImportadas
from gastoba.domain.conta import Conta, OrigemDaConta, PapelDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import TransacaoImportadaInvalida, TransacaoImportadaNaoEncontrada
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)

USUARIO = uuid4()


def montar(unidade_de_trabalho, com_par=True):
    banking = Conta(
        USUARIO,
        "BTG Banking",
        Dinheiro(0),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo="b",
        papel=PapelDaConta.CORRENTE,
    )
    investimentos = Conta(
        USUARIO,
        "BTG Investimentos",
        Dinheiro(0),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo="i",
        papel=PapelDaConta.INVESTIMENTO,
    )
    saida = TransacaoImportada(
        banking.id,
        "s",
        date(2026, 11, 5),
        "Pix para mim",
        Dinheiro(95645),
        SentidoDaTransacao.SAIDA,
    )
    entrada = TransacaoImportada(
        investimentos.id,
        "e",
        date(2026, 11, 5),
        "Pix recebido",
        Dinheiro(95645 if com_par else 1),
        SentidoDaTransacao.ENTRADA,
    )
    with unidade_de_trabalho as u:
        u.contas.adicionar(banking)
        u.contas.adicionar(investimentos)
        u.transacoes_importadas.adicionar_se_nova(saida)
        u.transacoes_importadas.adicionar_se_nova(entrada)
        u.commit()
    return saida, entrada


def test_a_caixa_sugere_o_par_nas_duas_pontas(unidade_de_trabalho):
    saida, entrada = montar(unidade_de_trabalho)
    itens = {
        i.transacao.id: i for i in ListarTransacoesImportadas(unidade_de_trabalho).executar(USUARIO)
    }
    assert itens[saida.id].par_sugerido_id == entrada.id
    assert itens[entrada.id].par_sugerido_id == saida.id


def test_aceitar_como_transferencia_persiste_as_duas_pontas(unidade_de_trabalho):
    saida, entrada = montar(unidade_de_trabalho)

    ClassificarTransferencia(unidade_de_trabalho).executar(
        USUARIO, saida.id, entrada.conta_id, entrada.id
    )

    with unidade_de_trabalho as u:
        assert u.transacoes_importadas.listar(USUARIO, EstadoDaTransacaoImportada.PENDENTE) == []
        aceitas = u.transacoes_importadas.listar(USUARIO, EstadoDaTransacaoImportada.ACEITA)
        assert {t.id for t in aceitas} == {saida.id, entrada.id}
        transferencia = u.transferencias.da_transacao(USUARIO, saida.id)
        assert set(transferencia.transacao_ids) == {saida.id, entrada.id}
        assert u.gastos.listar(USUARIO, date(2026, 1, 1), date(2026, 12, 31)) == []


def test_sem_par_nao_aceita_como_transferencia(unidade_de_trabalho):
    saida, entrada = montar(unidade_de_trabalho, com_par=False)
    with pytest.raises(TransacaoImportadaInvalida):
        ClassificarTransferencia(unidade_de_trabalho).executar(
            USUARIO, saida.id, entrada.conta_id, entrada.id
        )
    with unidade_de_trabalho as u:
        assert (
            len(u.transacoes_importadas.listar(USUARIO, EstadoDaTransacaoImportada.PENDENTE)) == 2
        )


def test_transacao_de_outro_usuario_nao_e_encontrada(unidade_de_trabalho):
    saida, entrada = montar(unidade_de_trabalho)
    with pytest.raises(TransacaoImportadaNaoEncontrada):
        ClassificarTransferencia(unidade_de_trabalho).executar(
            uuid4(), saida.id, entrada.conta_id, entrada.id
        )


def test_a_caixa_sugere_completar_a_transferencia_do_dono_e_so_dele(unidade_de_trabalho):
    saida, entrada = montar(unidade_de_trabalho)
    # Só a saída foi classificada; a entrada chega depois, ainda pendente.
    ClassificarTransferencia(unidade_de_trabalho).executar(
        USUARIO, saida.id, entrada.conta_id, None
    )
    (item,) = ListarTransacoesImportadas(unidade_de_trabalho).executar(USUARIO)
    with unidade_de_trabalho as u:
        transferencia = u.transferencias.da_transacao(USUARIO, saida.id)
    assert item.transacao.id == entrada.id
    assert item.transferencia_sugerida_id == transferencia.id
    assert ListarTransacoesImportadas(unidade_de_trabalho).executar(uuid4()) == []
