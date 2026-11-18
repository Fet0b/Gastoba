from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.desfazer_classificacao_importada import DesfazerClassificacaoImportada
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import MovimentoNaoDesfazivel, TransacaoImportadaNaoEncontrada
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)


@pytest.mark.parametrize("tipo", ["gasto", "ganho", "aporte", "resgate", "ignorada"])
def test_reabre_todos_os_tipos_sem_mudar_saldo_e_registra_reversao(unidade_de_trabalho, tipo):
    uow = unidade_de_trabalho
    pessoa = uuid4()
    conta = Conta(pessoa, "Banco", Dinheiro(50000), origem=OrigemDaConta.OPEN_FINANCE)
    transacao = TransacaoImportada(
        conta.id,
        "origem",
        date(2026, 11, 4),
        "Exemplo",
        Dinheiro(3200),
        SentidoDaTransacao.ENTRADA if tipo in ("ganho", "resgate") else SentidoDaTransacao.SAIDA,
    )
    with uow as u:
        u.contas.adicionar(conta)
        if tipo == "ignorada":
            transacao.ignorar()
        u.transacoes_importadas.adicionar_se_nova(transacao)
        u.commit()
    if tipo != "ignorada":
        AceitarTransacaoImportada(uow).executar(
            pessoa,
            transacao.id,
            CategoriaDoGasto.LAZER if tipo == "gasto" else None,
            ["exemplo"] if tipo in ("gasto", "ganho") else [],
            como_investimento=tipo in ("aporte", "resgate"),
        )
    resultado = DesfazerClassificacaoImportada(uow).executar(pessoa, transacao.id)
    estado = uow.confirmado
    assert estado.transacoes_importadas[transacao.id].estado == EstadoDaTransacaoImportada.PENDENTE
    assert not estado.gastos and not estado.ganhos and not estado.movimentos_de_investimento
    assert estado.contas[conta.id].saldo == Dinheiro(50000)
    assert resultado.lancamentos_removidos == (0 if tipo == "ignorada" else 1)
    assert len(estado.reversoes_de_classificacao) == 1
    reversao = estado.reversoes_de_classificacao[0]
    assert reversao.transacao_id == transacao.id and reversao.usuario_id == pessoa
    assert reversao.estado_anterior == ("ignorada" if tipo == "ignorada" else "aceita")
    with pytest.raises(MovimentoNaoDesfazivel):
        DesfazerClassificacaoImportada(uow).executar(pessoa, transacao.id)
    assert len(uow.confirmado.reversoes_de_classificacao) == 1
    with pytest.raises(TransacaoImportadaNaoEncontrada):
        DesfazerClassificacaoImportada(uow).executar(uuid4(), transacao.id)


def test_reversao_da_divisao_exige_confirmacao_e_remove_grupo_inteiro(unidade_de_trabalho):
    from gastoba.application.aceitar_transacao_importada_dividida import (
        AceitarTransacaoImportadaDividida,
    )
    from gastoba.domain.divisao_da_transacao import ParteDaTransacao
    from gastoba.domain.excecoes import DivisaoExigeConfirmacao

    uow = unidade_de_trabalho
    pessoa = uuid4()
    conta = Conta(pessoa, "Banco", Dinheiro(50000), origem=OrigemDaConta.OPEN_FINANCE)
    t = TransacaoImportada(
        conta.id,
        "dividida",
        date(2026, 11, 4),
        "Dividida",
        Dinheiro(10000),
        SentidoDaTransacao.SAIDA,
    )
    with uow as u:
        u.contas.adicionar(conta)
        u.transacoes_importadas.adicionar_se_nova(t)
        u.commit()
    AceitarTransacaoImportadaDividida(uow).executar(
        pessoa,
        t.id,
        [
            ParteDaTransacao(CategoriaDoGasto.LAZER, (), 40),
            ParteDaTransacao(None, (), 60, como_investimento=True),
        ],
    )
    caso = DesfazerClassificacaoImportada(uow)
    with pytest.raises(DivisaoExigeConfirmacao):
        caso.executar(pessoa, t.id)
    assert len(uow.confirmado.gastos) == 1
    assert not uow.confirmado.reversoes_de_classificacao
    caso.executar(pessoa, t.id, desfazer_divisao_inteira=True)
    assert not uow.confirmado.gastos and not uow.confirmado.movimentos_de_investimento
    assert len(uow.confirmado.reversoes_de_classificacao[0].lancamentos) == 2
