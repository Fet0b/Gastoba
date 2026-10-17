from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.registrar_ganho import RegistrarGanho
from gastoba.domain.dinheiro import LIMITE_CENTAVOS, Dinheiro
from gastoba.domain.excecoes import (
    ContaNaoEncontrada,
    DescricaoInvalida,
    TagInvalida,
    ValorInvalido,
)
from gastoba.domain.tag import Tag

USUARIO_ID = uuid4()
DATA = date(2026, 10, 5)


def registrar(unidade_de_trabalho, conta_id, **alteracoes):
    argumentos = {
        "usuario_id": USUARIO_ID,
        "conta_id": conta_id,
        "valor": Dinheiro(500000),
        "descricao": "Salário",
        "data": DATA,
        "tags": [],
    } | alteracoes
    return RegistrarGanho(unidade_de_trabalho).executar(**argumentos)


def test_grava_o_ganho_e_aumenta_o_saldo_exatamente(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(10000))

    ganho = registrar(unidade_de_trabalho, conta.id, valor=Dinheiro(500050))

    confirmado = unidade_de_trabalho.confirmado
    assert ganho.conta_id == conta.id
    assert confirmado.ganhos[ganho.id].valor == Dinheiro(500050)
    assert confirmado.ganhos[ganho.id].descricao == "Salário"
    assert confirmado.ganhos[ganho.id].data == DATA
    assert confirmado.contas[conta.id].saldo == Dinheiro(510050)
    assert unidade_de_trabalho.commits == 1


def test_saldo_negativo_sobe_e_pode_continuar_negativo(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(-20000))

    registrar(unidade_de_trabalho, conta.id, valor=Dinheiro(5000))

    assert unidade_de_trabalho.confirmado.contas[conta.id].saldo == Dinheiro(-15000)


def test_tags_sao_normalizadas_e_deduplicadas(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID)

    ganho = registrar(unidade_de_trabalho, conta.id, tags=["Pix", " pix ", "Salário  CLT"])

    assert ganho.tags == (Tag("pix"), Tag("salário clt"))


def test_dois_ganhos_acumulam_o_credito(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(0))

    registrar(unidade_de_trabalho, conta.id, valor=Dinheiro(1000))
    registrar(unidade_de_trabalho, conta.id, valor=Dinheiro(2500))

    assert unidade_de_trabalho.confirmado.contas[conta.id].saldo == Dinheiro(3500)
    assert len(unidade_de_trabalho.confirmado.ganhos) == 2


def test_conta_inexistente_levanta_conta_nao_encontrada_sem_gravar(
    unidade_de_trabalho, semear_conta
):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(10000))

    with pytest.raises(ContaNaoEncontrada):
        registrar(unidade_de_trabalho, uuid4())

    assert unidade_de_trabalho.confirmado.ganhos == {}
    assert unidade_de_trabalho.confirmado.contas[conta.id].saldo == Dinheiro(10000)
    assert unidade_de_trabalho.commits == 0


def test_conta_de_outro_usuario_levanta_conta_nao_encontrada_sem_gravar(
    unidade_de_trabalho, semear_conta
):
    alheia = semear_conta(usuario_id=uuid4(), saldo=Dinheiro(10000))

    with pytest.raises(ContaNaoEncontrada):
        registrar(unidade_de_trabalho, alheia.id)

    assert unidade_de_trabalho.confirmado.ganhos == {}
    assert unidade_de_trabalho.confirmado.contas[alheia.id].saldo == Dinheiro(10000)


@pytest.mark.parametrize(
    ("alteracoes", "excecao"),
    [
        ({"descricao": "   "}, DescricaoInvalida),
        ({"valor": Dinheiro(0)}, ValorInvalido),
        ({"tags": ["pix", "   "]}, TagInvalida),
    ],
)
def test_ganho_invalido_levanta_excecao_de_dominio_sem_gravar(
    unidade_de_trabalho, semear_conta, alteracoes, excecao
):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(10000))

    with pytest.raises(excecao):
        registrar(unidade_de_trabalho, conta.id, **alteracoes)

    assert unidade_de_trabalho.confirmado.ganhos == {}
    assert unidade_de_trabalho.confirmado.contas[conta.id].saldo == Dinheiro(10000)
    assert unidade_de_trabalho.commits == 0


def test_credito_alem_do_limite_levanta_valor_invalido_sem_gravar(
    unidade_de_trabalho, semear_conta
):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(LIMITE_CENTAVOS))

    with pytest.raises(ValorInvalido):
        registrar(unidade_de_trabalho, conta.id, valor=Dinheiro(1))

    assert unidade_de_trabalho.confirmado.ganhos == {}
    assert unidade_de_trabalho.confirmado.contas[conta.id].saldo == Dinheiro(LIMITE_CENTAVOS)
    assert unidade_de_trabalho.commits == 0
