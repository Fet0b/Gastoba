from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.excluir_ganho import ExcluirGanho
from gastoba.application.registrar_ganho import RegistrarGanho
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import GanhoDeRecorrencia, GanhoNaoEncontrado
from gastoba.domain.ganho import Ganho

USUARIO_ID = uuid4()
INICIO = date(2026, 10, 1)
FIM = date(2026, 10, 31)


def registrar(unidade_de_trabalho, conta_id, centavos=500000, usuario_id=USUARIO_ID):
    return RegistrarGanho(unidade_de_trabalho).executar(
        usuario_id=usuario_id,
        conta_id=conta_id,
        valor=Dinheiro(centavos),
        descricao="Salário",
        data=date(2026, 10, 5),
        tags=[],
    )


def saldo(unidade_de_trabalho, conta_id, usuario_id=USUARIO_ID):
    with unidade_de_trabalho as uow:
        return uow.contas.obter(usuario_id, conta_id).saldo


def test_exclui_o_ganho_e_devolve_o_saldo(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(100000))
    ganho = registrar(unidade_de_trabalho, conta.id, 500000)
    assert saldo(unidade_de_trabalho, conta.id) == Dinheiro(600000)

    ExcluirGanho(unidade_de_trabalho).executar(USUARIO_ID, ganho.id)

    assert saldo(unidade_de_trabalho, conta.id) == Dinheiro(100000)
    with unidade_de_trabalho as uow:
        assert uow.ganhos.listar(USUARIO_ID, INICIO, FIM) == []


def test_exclui_so_o_ganho_pedido(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(0))
    errado = registrar(unidade_de_trabalho, conta.id, 100)
    certo = registrar(unidade_de_trabalho, conta.id, 200)

    ExcluirGanho(unidade_de_trabalho).executar(USUARIO_ID, errado.id)

    with unidade_de_trabalho as uow:
        assert [g.id for g in uow.ganhos.listar(USUARIO_ID, INICIO, FIM)] == [certo.id]
    assert saldo(unidade_de_trabalho, conta.id) == Dinheiro(200)


def test_ganho_inexistente_e_recusado(unidade_de_trabalho):
    with pytest.raises(GanhoNaoEncontrado):
        ExcluirGanho(unidade_de_trabalho).executar(USUARIO_ID, uuid4())


def test_ganho_de_outro_usuario_nao_e_encontrado_e_nada_muda(unidade_de_trabalho, semear_conta):
    alheia = semear_conta(usuario_id=uuid4(), saldo=Dinheiro(0))
    ganho = registrar(unidade_de_trabalho, alheia.id, 300, usuario_id=alheia.usuario_id)

    with pytest.raises(GanhoNaoEncontrado):
        ExcluirGanho(unidade_de_trabalho).executar(USUARIO_ID, ganho.id)

    assert saldo(unidade_de_trabalho, alheia.id, alheia.usuario_id) == Dinheiro(300)


def test_ganho_gerado_por_recorrencia_nao_pode_ser_excluido(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(0))
    gerado = Ganho(
        conta_id=conta.id,
        valor=Dinheiro(1000),
        descricao="Salário",
        data=date(2026, 10, 5),
        recorrencia_id=uuid4(),
        competencia="2026-10",
    )
    with unidade_de_trabalho as uow:
        uow.ganhos.adicionar(gerado)
        uow.contas.creditar(conta.id, gerado.valor)
        uow.commit()

    with pytest.raises(GanhoDeRecorrencia):
        ExcluirGanho(unidade_de_trabalho).executar(USUARIO_ID, gerado.id)

    assert saldo(unidade_de_trabalho, conta.id) == Dinheiro(1000)
