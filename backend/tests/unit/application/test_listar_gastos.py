from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.listar_gastos import ListarGastos
from gastoba.application.registrar_gasto import RegistrarGasto
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ContaNaoEncontrada, PeriodoInvalido, TagInvalida

USUARIO_ID = uuid4()
INICIO = date(2026, 10, 1)
FIM = date(2026, 10, 31)


def registrar(
    unidade_de_trabalho,
    conta_id,
    data,
    descricao="Gasto",
    tags=(),
    categoria=CategoriaDoGasto.GASTO_FIXO,
    usuario_id=USUARIO_ID,
):
    return RegistrarGasto(unidade_de_trabalho).executar(
        usuario_id=usuario_id,
        conta_id=conta_id,
        valor=Dinheiro(100),
        descricao=descricao,
        data=data,
        categoria=categoria,
        tags=list(tags),
    )


def descricoes(gastos):
    return [g.descricao for g in gastos]


def test_filtra_por_periodo_inclusivo_em_ordem_de_data_decrescente(
    unidade_de_trabalho, semear_conta
):
    conta = semear_conta(usuario_id=USUARIO_ID)
    registrar(unidade_de_trabalho, conta.id, date(2026, 9, 30), "antes")
    registrar(unidade_de_trabalho, conta.id, INICIO, "inicio")
    registrar(unidade_de_trabalho, conta.id, date(2026, 10, 15), "meio")
    registrar(unidade_de_trabalho, conta.id, FIM, "fim")
    registrar(unidade_de_trabalho, conta.id, date(2026, 11, 1), "depois")

    gastos = ListarGastos(unidade_de_trabalho).executar(USUARIO_ID, INICIO, FIM)

    assert descricoes(gastos) == ["fim", "meio", "inicio"]


def test_filtra_por_conta(unidade_de_trabalho, semear_conta):
    nubank = semear_conta(usuario_id=USUARIO_ID, nome="Nubank")
    carteira = semear_conta(usuario_id=USUARIO_ID, nome="Carteira")
    registrar(unidade_de_trabalho, nubank.id, INICIO, "no nubank")
    registrar(unidade_de_trabalho, carteira.id, INICIO, "na carteira")

    gastos = ListarGastos(unidade_de_trabalho).executar(
        USUARIO_ID, INICIO, FIM, conta_id=carteira.id
    )

    assert descricoes(gastos) == ["na carteira"]


def test_filtra_por_tag_normalizada(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID)
    registrar(unidade_de_trabalho, conta.id, INICIO, "feira", tags=["mercado", "pix"])
    registrar(unidade_de_trabalho, conta.id, INICIO, "cinema", tags=["pix"])

    gastos = ListarGastos(unidade_de_trabalho).executar(USUARIO_ID, INICIO, FIM, tag="Mercado")

    assert descricoes(gastos) == ["feira"]


def test_filtra_por_categoria(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID)
    registrar(unidade_de_trabalho, conta.id, INICIO, "cinema", categoria=CategoriaDoGasto.LAZER)
    registrar(unidade_de_trabalho, conta.id, INICIO, "aluguel")

    gastos = ListarGastos(unidade_de_trabalho).executar(
        USUARIO_ID, INICIO, FIM, categoria=CategoriaDoGasto.LAZER
    )

    assert descricoes(gastos) == ["cinema"]
    assert all(g.categoria == CategoriaDoGasto.LAZER for g in gastos)


def test_categoria_combina_com_tag_e_conta(unidade_de_trabalho, semear_conta):
    nubank = semear_conta(usuario_id=USUARIO_ID, nome="Nubank")
    carteira = semear_conta(usuario_id=USUARIO_ID, nome="Carteira")
    conforto = CategoriaDoGasto.CONFORTO
    registrar(unidade_de_trabalho, nubank.id, INICIO, "alvo", ["mercado"], conforto)
    registrar(unidade_de_trabalho, nubank.id, INICIO, "outra categoria", ["mercado"])
    registrar(unidade_de_trabalho, nubank.id, INICIO, "outra tag", ["pix"], conforto)
    registrar(unidade_de_trabalho, carteira.id, INICIO, "outra conta", ["mercado"], conforto)

    gastos = ListarGastos(unidade_de_trabalho).executar(
        USUARIO_ID, INICIO, FIM, conta_id=nubank.id, tag="mercado", categoria=conforto
    )

    assert descricoes(gastos) == ["alvo"]


def test_mesma_tag_em_categorias_diferentes_convive(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID)
    registrar(
        unidade_de_trabalho, conta.id, INICIO, "feira", ["mercado"], CategoriaDoGasto.CONFORTO
    )
    registrar(
        unidade_de_trabalho,
        conta.id,
        FIM,
        "compra do mês",
        ["mercado"],
        CategoriaDoGasto.GASTO_FIXO,
    )

    gastos = ListarGastos(unidade_de_trabalho).executar(USUARIO_ID, INICIO, FIM, tag="mercado")

    assert descricoes(gastos) == ["compra do mês", "feira"]


def test_nao_mostra_gastos_de_outro_usuario(unidade_de_trabalho, semear_conta):
    outro_usuario = uuid4()
    alheia = semear_conta(usuario_id=outro_usuario)
    registrar(unidade_de_trabalho, alheia.id, INICIO, "alheio", usuario_id=outro_usuario)

    assert ListarGastos(unidade_de_trabalho).executar(USUARIO_ID, INICIO, FIM) == []


def test_inicio_depois_do_fim_levanta_periodo_invalido(unidade_de_trabalho):
    with pytest.raises(PeriodoInvalido):
        ListarGastos(unidade_de_trabalho).executar(USUARIO_ID, FIM, INICIO)


def test_conta_inexistente_no_filtro_levanta_conta_nao_encontrada(unidade_de_trabalho):
    with pytest.raises(ContaNaoEncontrada):
        ListarGastos(unidade_de_trabalho).executar(USUARIO_ID, INICIO, FIM, conta_id=uuid4())


def test_conta_de_outro_usuario_no_filtro_levanta_conta_nao_encontrada(
    unidade_de_trabalho, semear_conta
):
    alheia = semear_conta(usuario_id=uuid4())

    with pytest.raises(ContaNaoEncontrada):
        ListarGastos(unidade_de_trabalho).executar(USUARIO_ID, INICIO, FIM, conta_id=alheia.id)


def test_tag_vazia_levanta_tag_invalida(unidade_de_trabalho):
    with pytest.raises(TagInvalida):
        ListarGastos(unidade_de_trabalho).executar(USUARIO_ID, INICIO, FIM, tag="  ")
