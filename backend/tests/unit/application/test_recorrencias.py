from datetime import date, timedelta
from uuid import uuid4

import pytest

from gastoba.application.alterar_recorrencia import AlterarRecorrencia
from gastoba.application.criar_recorrencia import CriarRecorrencia
from gastoba.application.encerrar_recorrencia import EncerrarRecorrencia
from gastoba.application.listar_recorrencias import ListarRecorrencias
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    ContaNaoEncontrada,
    DescricaoInvalida,
    RecorrenciaInvalida,
    RecorrenciaNaoEncontrada,
    TagInvalida,
    ValorInvalido,
)
from gastoba.domain.recorrencia import (
    LIMITE_DE_RECORRENCIAS_ATIVAS,
    Recorrencia,
    TipoDeRecorrencia,
)
from gastoba.domain.tag import Tag

USUARIO_ID = uuid4()


def criar(unidade_de_trabalho, relogio, conta_id, **alteracoes) -> Recorrencia:
    argumentos = {
        "usuario_id": USUARIO_ID,
        "tipo": TipoDeRecorrencia.GANHO,
        "conta_id": conta_id,
        "valor": Dinheiro(500000),
        "descricao": "Salário",
        "dia_do_mes": 5,
        "inicio": date(2026, 10, 1),
        "categoria": None,
        "tags": [],
        "fim": None,
    } | alteracoes
    return CriarRecorrencia(unidade_de_trabalho, relogio).executar(**argumentos)


def test_cria_a_recorrencia_e_ja_gera_o_mes_vencido(unidade_de_trabalho, semear_conta, relogio):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(0))

    recorrencia = criar(unidade_de_trabalho, relogio, conta.id, tags=["Salário  CLT", "pix"])

    confirmado = unidade_de_trabalho.confirmado
    assert confirmado.recorrencias[recorrencia.id].tags == (Tag("salário clt"), Tag("pix"))
    assert confirmado.recorrencias[recorrencia.id].ativa is True
    [ganho] = confirmado.ganhos.values()  # hoje é 12/10/2026: o dia 5 de outubro já passou
    assert ganho.recorrencia_id == recorrencia.id
    assert confirmado.contas[conta.id].saldo == Dinheiro(500000)


def test_recorrencia_de_gasto_exige_categoria_e_debita(unidade_de_trabalho, semear_conta, relogio):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(1000000))

    with pytest.raises(RecorrenciaInvalida):
        criar(unidade_de_trabalho, relogio, conta.id, tipo=TipoDeRecorrencia.GASTO)
    assert unidade_de_trabalho.confirmado.recorrencias == {}

    criar(
        unidade_de_trabalho,
        relogio,
        conta.id,
        tipo=TipoDeRecorrencia.GASTO,
        categoria=CategoriaDoGasto.GASTO_FIXO,
        descricao="Aluguel",
        valor=Dinheiro(150000),
    )
    assert unidade_de_trabalho.confirmado.contas[conta.id].saldo == Dinheiro(850000)


def test_inicio_no_futuro_nao_gera_nada_ainda(unidade_de_trabalho, semear_conta, relogio):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(0))

    criar(unidade_de_trabalho, relogio, conta.id, inicio=date(2026, 12, 1))

    assert len(unidade_de_trabalho.confirmado.recorrencias) == 1
    assert unidade_de_trabalho.confirmado.ganhos == {}


def test_conta_inexistente_ou_alheia_levanta_conta_nao_encontrada(
    unidade_de_trabalho, semear_conta, relogio
):
    alheia = semear_conta(usuario_id=uuid4())

    for conta_id in (uuid4(), alheia.id):
        with pytest.raises(ContaNaoEncontrada):
            criar(unidade_de_trabalho, relogio, conta_id)
    assert unidade_de_trabalho.confirmado.recorrencias == {}


@pytest.mark.parametrize(
    ("alteracoes", "excecao"),
    [
        ({"descricao": "  "}, DescricaoInvalida),
        ({"valor": Dinheiro(0)}, ValorInvalido),
        ({"dia_do_mes": 32}, RecorrenciaInvalida),
        ({"fim": date(2026, 9, 1)}, RecorrenciaInvalida),
        ({"tags": ["pix", "  "]}, TagInvalida),
    ],
)
def test_recorrencia_invalida_nao_grava(
    unidade_de_trabalho, semear_conta, relogio, alteracoes, excecao
):
    conta = semear_conta(usuario_id=USUARIO_ID)

    with pytest.raises(excecao):
        criar(unidade_de_trabalho, relogio, conta.id, **alteracoes)

    assert unidade_de_trabalho.confirmado.recorrencias == {}
    assert unidade_de_trabalho.commits == 0


def test_inicio_mais_de_cinco_anos_no_passado_e_recusado(
    unidade_de_trabalho, semear_conta, relogio
):
    conta = semear_conta(usuario_id=USUARIO_ID)

    with pytest.raises(RecorrenciaInvalida):
        criar(unidade_de_trabalho, relogio, conta.id, inicio=date(2021, 10, 11))
    criar(unidade_de_trabalho, relogio, conta.id, inicio=date(2021, 10, 12))


def test_limite_de_recorrencias_ativas_por_pessoa(unidade_de_trabalho, semear_conta, relogio):
    conta = semear_conta(usuario_id=USUARIO_ID)
    for i in range(LIMITE_DE_RECORRENCIAS_ATIVAS):
        criar(unidade_de_trabalho, relogio, conta.id, descricao=f"R{i}", inicio=date(2026, 12, 1))

    with pytest.raises(RecorrenciaInvalida, match="no máximo 50"):
        criar(unidade_de_trabalho, relogio, conta.id, descricao="Extra", inicio=date(2026, 12, 1))

    # Encerrar uma libera uma vaga; e o limite é por pessoa.
    primeira = next(iter(unidade_de_trabalho.confirmado.recorrencias))
    EncerrarRecorrencia(unidade_de_trabalho).executar(USUARIO_ID, primeira)
    criar(unidade_de_trabalho, relogio, conta.id, descricao="Cabe", inicio=date(2026, 12, 1))


def test_altera_so_os_campos_editaveis_e_nao_mexe_no_que_foi_gerado(
    unidade_de_trabalho, semear_conta, relogio
):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(0))
    original = criar(unidade_de_trabalho, relogio, conta.id)

    alterada = AlterarRecorrencia(unidade_de_trabalho).executar(
        USUARIO_ID,
        original.id,
        Dinheiro(600000),
        "Salário novo",
        10,
        None,
        ["Fixo"],
        date(2027, 1, 31),
    )

    gravada = unidade_de_trabalho.confirmado.recorrencias[original.id]
    assert alterada.valor == gravada.valor == Dinheiro(600000)
    assert (gravada.descricao, gravada.dia_do_mes, gravada.fim) == (
        "Salário novo",
        10,
        date(2027, 1, 31),
    )
    assert gravada.tags == (Tag("fixo"),)
    assert (gravada.tipo, gravada.conta_id, gravada.inicio) == (
        original.tipo,
        original.conta_id,
        original.inicio,
    )
    [ganho] = unidade_de_trabalho.confirmado.ganhos.values()
    assert ganho.valor == Dinheiro(500000) and ganho.descricao == "Salário"


def test_alterar_com_dados_invalidos_ou_recorrencia_alheia(
    unidade_de_trabalho, semear_conta, relogio
):
    conta = semear_conta(usuario_id=USUARIO_ID)
    original = criar(unidade_de_trabalho, relogio, conta.id, inicio=date(2026, 12, 1))

    with pytest.raises(RecorrenciaInvalida):  # ganho com categoria
        AlterarRecorrencia(unidade_de_trabalho).executar(
            USUARIO_ID, original.id, Dinheiro(1), "x", 5, CategoriaDoGasto.LAZER, [], None
        )
    with pytest.raises(RecorrenciaNaoEncontrada):
        AlterarRecorrencia(unidade_de_trabalho).executar(
            uuid4(), original.id, Dinheiro(1), "x", 5, None, [], None
        )
    with pytest.raises(RecorrenciaNaoEncontrada):
        AlterarRecorrencia(unidade_de_trabalho).executar(
            USUARIO_ID, uuid4(), Dinheiro(1), "x", 5, None, [], None
        )
    assert unidade_de_trabalho.confirmado.recorrencias[original.id].descricao == "Salário"


def test_encerrar_para_de_gerar_e_e_idempotente(unidade_de_trabalho, semear_conta, relogio):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(0))
    recorrencia = criar(unidade_de_trabalho, relogio, conta.id)

    EncerrarRecorrencia(unidade_de_trabalho).executar(USUARIO_ID, recorrencia.id)
    EncerrarRecorrencia(unidade_de_trabalho).executar(USUARIO_ID, recorrencia.id)

    assert unidade_de_trabalho.confirmado.recorrencias[recorrencia.id].ativa is False
    assert len(unidade_de_trabalho.confirmado.ganhos) == 1  # o histórico fica
    relogio.avancar(timedelta(days=60))
    from gastoba.application.processar_recorrencias import ProcessarRecorrencias

    assert ProcessarRecorrencias(unidade_de_trabalho, relogio).executar() == 0


def test_encerrar_recorrencia_inexistente_ou_alheia(unidade_de_trabalho, semear_conta, relogio):
    conta = semear_conta(usuario_id=USUARIO_ID)
    recorrencia = criar(unidade_de_trabalho, relogio, conta.id, inicio=date(2026, 12, 1))

    for usuario, id in ((USUARIO_ID, uuid4()), (uuid4(), recorrencia.id)):
        with pytest.raises(RecorrenciaNaoEncontrada):
            EncerrarRecorrencia(unidade_de_trabalho).executar(usuario, id)
    assert unidade_de_trabalho.confirmado.recorrencias[recorrencia.id].ativa is True


def test_listar_devolve_so_as_do_usuario_ativas_e_encerradas(
    unidade_de_trabalho, semear_conta, relogio
):
    conta = semear_conta(usuario_id=USUARIO_ID)
    alheia = semear_conta(usuario_id=uuid4(), nome="Alheia")
    criar(unidade_de_trabalho, relogio, conta.id, descricao="Bolsa", inicio=date(2026, 12, 1))
    encerrada = criar(
        unidade_de_trabalho, relogio, conta.id, descricao="Antiga", inicio=date(2026, 12, 1)
    )
    EncerrarRecorrencia(unidade_de_trabalho).executar(USUARIO_ID, encerrada.id)
    CriarRecorrencia(unidade_de_trabalho, relogio).executar(
        alheia.usuario_id,
        TipoDeRecorrencia.GANHO,
        alheia.id,
        Dinheiro(100),
        "Alheia",
        1,
        date(2026, 12, 1),
        None,
        [],
        None,
    )

    lista = ListarRecorrencias(unidade_de_trabalho).executar(USUARIO_ID)

    assert [(r.descricao, r.ativa) for r in lista] == [("Antiga", False), ("Bolsa", True)]
