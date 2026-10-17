from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.registrar_gasto import RegistrarGasto
from gastoba.application.resumir_gastos_por_tag import ResumirGastosPorTag
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ContaNaoEncontrada, PeriodoInvalido

USUARIO_ID = uuid4()
INICIO = date(2026, 10, 1)
FIM = date(2026, 10, 31)


def registrar(
    unidade_de_trabalho,
    conta_id,
    centavos,
    tags=(),
    categoria=CategoriaDoGasto.CONFORTO,
    data=INICIO,
    usuario_id=USUARIO_ID,
):
    RegistrarGasto(unidade_de_trabalho).executar(
        usuario_id=usuario_id,
        conta_id=conta_id,
        valor=Dinheiro(centavos),
        descricao="Gasto",
        data=data,
        categoria=categoria,
        tags=list(tags),
    )


def fatias(resumo):
    return [(None if f.tag is None else str(f.tag), f.valor.centavos) for f in resumo.fatias]


def test_divide_o_total_entre_as_tags_e_o_sem_tag(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID)
    registrar(unidade_de_trabalho, conta.id, 1000, ["mercado", "pix"])
    registrar(unidade_de_trabalho, conta.id, 400)

    resumo = ResumirGastosPorTag(unidade_de_trabalho).executar(USUARIO_ID, INICIO, FIM)

    assert resumo.total == Dinheiro(1400)
    assert fatias(resumo) == [("mercado", 500), ("pix", 500), (None, 400)]


def test_periodo_sem_gastos_devolve_resumo_vazio(unidade_de_trabalho):
    resumo = ResumirGastosPorTag(unidade_de_trabalho).executar(USUARIO_ID, INICIO, FIM)

    assert resumo.total == Dinheiro(0)
    assert resumo.fatias == ()


def test_so_conta_os_gastos_do_periodo(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID)
    registrar(unidade_de_trabalho, conta.id, 100, ["a"], data=date(2026, 9, 30))
    registrar(unidade_de_trabalho, conta.id, 200, ["a"], data=FIM)

    resumo = ResumirGastosPorTag(unidade_de_trabalho).executar(USUARIO_ID, INICIO, FIM)

    assert fatias(resumo) == [("a", 200)]


def test_filtra_por_conta_e_por_categoria(unidade_de_trabalho, semear_conta):
    nubank = semear_conta(usuario_id=USUARIO_ID, nome="Nubank")
    carteira = semear_conta(usuario_id=USUARIO_ID, nome="Carteira")
    registrar(unidade_de_trabalho, nubank.id, 100, ["a"])
    registrar(unidade_de_trabalho, carteira.id, 200, ["b"], categoria=CategoriaDoGasto.LAZER)
    registrar(unidade_de_trabalho, carteira.id, 300, ["c"])

    por_conta = ResumirGastosPorTag(unidade_de_trabalho).executar(
        USUARIO_ID, INICIO, FIM, conta_id=carteira.id
    )
    por_categoria = ResumirGastosPorTag(unidade_de_trabalho).executar(
        USUARIO_ID, INICIO, FIM, categoria=CategoriaDoGasto.LAZER
    )

    assert fatias(por_conta) == [("c", 300), ("b", 200)]
    assert fatias(por_categoria) == [("b", 200)]


def test_nao_inclui_gastos_de_outro_usuario(unidade_de_trabalho, semear_conta):
    minha = semear_conta(usuario_id=USUARIO_ID, nome="Minha")
    alheia = semear_conta(usuario_id=uuid4(), nome="Alheia")
    registrar(unidade_de_trabalho, minha.id, 100, ["a"])
    registrar(unidade_de_trabalho, alheia.id, 900, ["a"], usuario_id=alheia.usuario_id)

    resumo = ResumirGastosPorTag(unidade_de_trabalho).executar(USUARIO_ID, INICIO, FIM)

    assert resumo.total == Dinheiro(100)


def test_periodo_invertido_e_recusado(unidade_de_trabalho):
    with pytest.raises(PeriodoInvalido):
        ResumirGastosPorTag(unidade_de_trabalho).executar(USUARIO_ID, FIM, INICIO)


def test_conta_de_outro_usuario_nao_e_encontrada(unidade_de_trabalho, semear_conta):
    alheia = semear_conta(usuario_id=uuid4())

    with pytest.raises(ContaNaoEncontrada):
        ResumirGastosPorTag(unidade_de_trabalho).executar(
            USUARIO_ID, INICIO, FIM, conta_id=alheia.id
        )
