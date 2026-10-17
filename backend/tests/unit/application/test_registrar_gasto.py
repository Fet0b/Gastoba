from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.registrar_gasto import RegistrarGasto
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    ContaNaoEncontrada,
    DescricaoInvalida,
    TagInvalida,
    ValorInvalido,
)
from gastoba.domain.tag import Tag

USUARIO_ID = uuid4()
DATA = date(2026, 10, 10)


def registrar(unidade_de_trabalho, conta_id, **alteracoes):
    argumentos = {
        "usuario_id": USUARIO_ID,
        "conta_id": conta_id,
        "valor": Dinheiro(2590),
        "descricao": "Almoço",
        "data": DATA,
        "categoria": CategoriaDoGasto.GASTO_FIXO,
        "tags": [],
    } | alteracoes
    return RegistrarGasto(unidade_de_trabalho).executar(**argumentos)


def test_grava_o_gasto_com_categoria_e_reduz_o_saldo_exatamente(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(10000))

    gasto = registrar(
        unidade_de_trabalho, conta.id, valor=Dinheiro(2590), categoria=CategoriaDoGasto.LAZER
    )

    confirmado = unidade_de_trabalho.confirmado
    assert gasto.conta_id == conta.id
    assert gasto.categoria == CategoriaDoGasto.LAZER
    assert confirmado.gastos[gasto.id].categoria == CategoriaDoGasto.LAZER
    assert confirmado.gastos[gasto.id].valor == Dinheiro(2590)
    assert confirmado.gastos[gasto.id].descricao == "Almoço"
    assert confirmado.gastos[gasto.id].data == DATA
    assert confirmado.contas[conta.id].saldo == Dinheiro(7410)
    assert unidade_de_trabalho.commits == 1


def test_tags_sao_normalizadas_e_deduplicadas(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID)

    gasto = registrar(unidade_de_trabalho, conta.id, tags=["Pix", " pix ", "Mercado  Livre"])

    assert gasto.tags == (Tag("pix"), Tag("mercado livre"))
    assert unidade_de_trabalho.confirmado.gastos[gasto.id].tags == gasto.tags


def test_dois_gastos_acumulam_o_debito(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(10000))

    registrar(unidade_de_trabalho, conta.id, valor=Dinheiro(1000))
    registrar(unidade_de_trabalho, conta.id, valor=Dinheiro(2500))

    assert unidade_de_trabalho.confirmado.contas[conta.id].saldo == Dinheiro(6500)
    assert len(unidade_de_trabalho.confirmado.gastos) == 2


def test_conta_inexistente_levanta_conta_nao_encontrada_sem_gravar(
    unidade_de_trabalho, semear_conta
):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(10000))

    with pytest.raises(ContaNaoEncontrada):
        registrar(unidade_de_trabalho, uuid4())

    assert unidade_de_trabalho.confirmado.gastos == {}
    assert unidade_de_trabalho.confirmado.contas[conta.id].saldo == Dinheiro(10000)
    assert unidade_de_trabalho.commits == 0


def test_conta_de_outro_usuario_levanta_conta_nao_encontrada_sem_gravar(
    unidade_de_trabalho, semear_conta
):
    alheia = semear_conta(usuario_id=uuid4(), saldo=Dinheiro(10000))

    with pytest.raises(ContaNaoEncontrada):
        registrar(unidade_de_trabalho, alheia.id)

    assert unidade_de_trabalho.confirmado.gastos == {}
    assert unidade_de_trabalho.confirmado.contas[alheia.id].saldo == Dinheiro(10000)
    assert unidade_de_trabalho.commits == 0


@pytest.mark.parametrize(
    ("alteracoes", "excecao"),
    [
        ({"descricao": "   "}, DescricaoInvalida),
        ({"valor": Dinheiro(0)}, ValorInvalido),
        ({"tags": ["pix", "   "]}, TagInvalida),
    ],
)
def test_gasto_invalido_levanta_excecao_de_dominio_sem_gravar(
    unidade_de_trabalho, semear_conta, alteracoes, excecao
):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(10000))

    with pytest.raises(excecao):
        registrar(unidade_de_trabalho, conta.id, **alteracoes)

    assert unidade_de_trabalho.confirmado.gastos == {}
    assert unidade_de_trabalho.confirmado.contas[conta.id].saldo == Dinheiro(10000)
    assert unidade_de_trabalho.commits == 0


def test_debito_alem_do_limite_levanta_valor_invalido_sem_gravar(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(-(10**14)))

    with pytest.raises(ValorInvalido):
        registrar(unidade_de_trabalho, conta.id, valor=Dinheiro(1))

    assert unidade_de_trabalho.confirmado.gastos == {}
    assert unidade_de_trabalho.confirmado.contas[conta.id].saldo == Dinheiro(-(10**14))
    assert unidade_de_trabalho.commits == 0
