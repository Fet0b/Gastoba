from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

from gastoba.application.processar_recorrencias import ProcessarRecorrencias
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import LIMITE_CENTAVOS, Dinheiro
from gastoba.domain.recorrencia import Recorrencia, TipoDeRecorrencia
from gastoba.domain.tag import Tag

USUARIO_ID = uuid4()


def semear_recorrencia(unidade_de_trabalho, conta, **alteracoes) -> Recorrencia:
    tipo = alteracoes.pop("tipo", TipoDeRecorrencia.GANHO)
    argumentos = {
        "usuario_id": conta.usuario_id,
        "tipo": tipo,
        "conta_id": conta.id,
        "valor": Dinheiro(500000),
        "descricao": "Salário" if tipo is TipoDeRecorrencia.GANHO else "Aluguel",
        "dia_do_mes": 5,
        "inicio": date(2026, 8, 1),
        "categoria": None if tipo is TipoDeRecorrencia.GANHO else CategoriaDoGasto.GASTO_FIXO,
    } | alteracoes
    recorrencia = Recorrencia(**argumentos)
    unidade_de_trabalho.confirmado.recorrencias[recorrencia.id] = recorrencia
    return recorrencia


def processar(unidade_de_trabalho, relogio, usuario_id=None) -> int:
    return ProcessarRecorrencias(unidade_de_trabalho, relogio).executar(usuario_id)


def test_gera_um_ganho_por_mes_vencido_e_credita_a_conta(
    unidade_de_trabalho, semear_conta, relogio
):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(0))
    recorrencia = semear_recorrencia(unidade_de_trabalho, conta)  # hoje: 12/10/2026

    criados = processar(unidade_de_trabalho, relogio)

    confirmado = unidade_de_trabalho.confirmado
    assert criados == 3
    ganhos = sorted(confirmado.ganhos.values(), key=lambda g: g.data)
    assert [g.data for g in ganhos] == [date(2026, 8, 5), date(2026, 9, 5), date(2026, 10, 5)]
    assert [g.competencia for g in ganhos] == ["2026-08", "2026-09", "2026-10"]
    assert all(g.recorrencia_id == recorrencia.id for g in ganhos)
    assert all(g.descricao == "Salário" and g.valor == Dinheiro(500000) for g in ganhos)
    assert confirmado.contas[conta.id].saldo == Dinheiro(1500000)


def test_gera_gasto_com_categoria_e_tags_e_debita_a_conta(
    unidade_de_trabalho, semear_conta, relogio
):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(2000000))
    semear_recorrencia(
        unidade_de_trabalho,
        conta,
        tipo=TipoDeRecorrencia.GASTO,
        valor=Dinheiro(150000),
        tags=(Tag("moradia"),),
        inicio=date(2026, 10, 1),
    )

    processar(unidade_de_trabalho, relogio)

    [gasto] = unidade_de_trabalho.confirmado.gastos.values()
    assert gasto.categoria == CategoriaDoGasto.GASTO_FIXO
    assert gasto.tags == (Tag("moradia"),)
    assert gasto.data == date(2026, 10, 5)
    assert gasto.competencia == "2026-10"
    assert unidade_de_trabalho.confirmado.contas[conta.id].saldo == Dinheiro(1850000)


def test_rodar_de_novo_nao_duplica_nem_mexe_no_saldo(unidade_de_trabalho, semear_conta, relogio):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(0))
    semear_recorrencia(unidade_de_trabalho, conta)
    processar(unidade_de_trabalho, relogio)

    segunda_vez = processar(unidade_de_trabalho, relogio)

    assert segunda_vez == 0
    assert len(unidade_de_trabalho.confirmado.ganhos) == 3
    assert unidade_de_trabalho.confirmado.contas[conta.id].saldo == Dinheiro(1500000)


def test_recupera_os_meses_perdidos_quando_o_tempo_avanca(
    unidade_de_trabalho, semear_conta, relogio
):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(0))
    semear_recorrencia(unidade_de_trabalho, conta)
    processar(unidade_de_trabalho, relogio)

    relogio.avancar(timedelta(days=100))  # servidor parado: vai a 20/01/2027
    novos = processar(unidade_de_trabalho, relogio)

    assert novos == 3  # novembro, dezembro e janeiro
    assert len(unidade_de_trabalho.confirmado.ganhos) == 6
    assert unidade_de_trabalho.confirmado.contas[conta.id].saldo == Dinheiro(3000000)


def test_o_dia_de_hoje_e_o_de_brasilia_e_nao_o_do_utc(unidade_de_trabalho, semear_conta, relogio):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(0))
    semear_recorrencia(unidade_de_trabalho, conta, dia_do_mes=1, inicio=date(2026, 10, 1))
    # 01:00 UTC do dia 1º de novembro ainda é 31/10 em Brasília: novembro não venceu.
    relogio.instante = datetime(2026, 11, 1, 1, 0, tzinfo=UTC)

    processar(unidade_de_trabalho, relogio)
    assert [g.competencia for g in unidade_de_trabalho.confirmado.ganhos.values()] == ["2026-10"]

    relogio.instante = datetime(2026, 11, 1, 3, 0, tzinfo=UTC)
    processar(unidade_de_trabalho, relogio)
    assert len(unidade_de_trabalho.confirmado.ganhos) == 2


def test_recorrencia_encerrada_nao_gera(unidade_de_trabalho, semear_conta, relogio):
    conta = semear_conta(usuario_id=USUARIO_ID)
    semear_recorrencia(unidade_de_trabalho, conta, ativa=False)

    assert processar(unidade_de_trabalho, relogio) == 0
    assert unidade_de_trabalho.confirmado.ganhos == {}


def test_respeita_o_fim_da_recorrencia(unidade_de_trabalho, semear_conta, relogio):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(0))
    semear_recorrencia(unidade_de_trabalho, conta, fim=date(2026, 9, 30))

    processar(unidade_de_trabalho, relogio)

    assert sorted(g.competencia for g in unidade_de_trabalho.confirmado.ganhos.values()) == [
        "2026-08",
        "2026-09",
    ]


def test_filtra_por_usuario_ou_processa_todos(unidade_de_trabalho, semear_conta, relogio):
    outro = uuid4()
    minha = semear_conta(usuario_id=USUARIO_ID, nome="Minha", saldo=Dinheiro(0))
    alheia = semear_conta(usuario_id=outro, nome="Alheia", saldo=Dinheiro(0))
    semear_recorrencia(unidade_de_trabalho, minha, inicio=date(2026, 10, 1))
    semear_recorrencia(unidade_de_trabalho, alheia, inicio=date(2026, 10, 1))

    assert processar(unidade_de_trabalho, relogio, usuario_id=USUARIO_ID) == 1
    assert unidade_de_trabalho.confirmado.contas[alheia.id].saldo == Dinheiro(0)

    assert processar(unidade_de_trabalho, relogio) == 1  # só falta a do outro
    assert unidade_de_trabalho.confirmado.contas[alheia.id].saldo == Dinheiro(500000)


def test_uma_que_falha_nao_impede_as_demais(unidade_de_trabalho, semear_conta, relogio):
    cheia = semear_conta(usuario_id=USUARIO_ID, nome="Cheia", saldo=Dinheiro(LIMITE_CENTAVOS))
    boa = semear_conta(usuario_id=USUARIO_ID, nome="Boa", saldo=Dinheiro(0))
    semear_recorrencia(unidade_de_trabalho, cheia, inicio=date(2026, 10, 1))
    semear_recorrencia(unidade_de_trabalho, boa, inicio=date(2026, 10, 1))

    criados = processar(unidade_de_trabalho, relogio)

    assert criados == 1
    assert unidade_de_trabalho.confirmado.contas[cheia.id].saldo == Dinheiro(LIMITE_CENTAVOS)
    assert unidade_de_trabalho.confirmado.contas[boa.id].saldo == Dinheiro(500000)


def test_conta_inexistente_e_ignorada(unidade_de_trabalho, semear_conta, relogio):
    conta = semear_conta(usuario_id=USUARIO_ID)
    semear_recorrencia(unidade_de_trabalho, conta)
    del unidade_de_trabalho.confirmado.contas[conta.id]

    assert processar(unidade_de_trabalho, relogio) == 0
    assert unidade_de_trabalho.confirmado.ganhos == {}
