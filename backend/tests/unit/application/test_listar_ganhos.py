from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.listar_ganhos import ListarGanhos
from gastoba.application.registrar_ganho import RegistrarGanho
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ContaNaoEncontrada, PeriodoInvalido

USUARIO_ID = uuid4()


def _registrar(unidade_de_trabalho, conta, descricao, data, usuario_id=USUARIO_ID):
    return RegistrarGanho(unidade_de_trabalho).executar(
        usuario_id, conta.id, Dinheiro(1000), descricao, data, []
    )


def _listar(unidade_de_trabalho, inicio, fim, **filtros):
    return ListarGanhos(unidade_de_trabalho).executar(USUARIO_ID, inicio, fim, **filtros)


def test_lista_so_o_periodo_inclusivo_da_data_mais_recente_para_a_mais_antiga(
    unidade_de_trabalho, semear_conta
):
    conta = semear_conta(usuario_id=USUARIO_ID)
    _registrar(unidade_de_trabalho, conta, "Antes", date(2026, 9, 30))
    _registrar(unidade_de_trabalho, conta, "Primeiro", date(2026, 10, 1))
    _registrar(unidade_de_trabalho, conta, "Último", date(2026, 10, 31))
    _registrar(unidade_de_trabalho, conta, "Depois", date(2026, 11, 1))

    ganhos = _listar(unidade_de_trabalho, date(2026, 10, 1), date(2026, 10, 31))

    assert [g.descricao for g in ganhos] == ["Último", "Primeiro"]


def test_filtra_por_conta(unidade_de_trabalho, semear_conta):
    uma = semear_conta(usuario_id=USUARIO_ID, nome="Uma")
    outra = semear_conta(usuario_id=USUARIO_ID, nome="Outra")
    _registrar(unidade_de_trabalho, uma, "Da uma", date(2026, 10, 2))
    _registrar(unidade_de_trabalho, outra, "Da outra", date(2026, 10, 2))

    ganhos = _listar(unidade_de_trabalho, date(2026, 10, 1), date(2026, 10, 31), conta_id=uma.id)

    assert [g.descricao for g in ganhos] == ["Da uma"]


def test_nao_lista_ganhos_de_outro_usuario(unidade_de_trabalho, semear_conta):
    alheio = uuid4()
    conta_alheia = semear_conta(usuario_id=alheio, nome="Alheia")
    _registrar(unidade_de_trabalho, conta_alheia, "Alheio", date(2026, 10, 2), usuario_id=alheio)

    assert _listar(unidade_de_trabalho, date(2026, 10, 1), date(2026, 10, 31)) == []


def test_periodo_invertido_levanta_periodo_invalido(unidade_de_trabalho):
    with pytest.raises(PeriodoInvalido):
        _listar(unidade_de_trabalho, date(2026, 10, 31), date(2026, 10, 1))


def test_filtro_por_conta_de_outro_usuario_levanta_conta_nao_encontrada(
    unidade_de_trabalho, semear_conta
):
    alheia = semear_conta(usuario_id=uuid4())

    with pytest.raises(ContaNaoEncontrada):
        _listar(unidade_de_trabalho, date(2026, 10, 1), date(2026, 10, 31), conta_id=alheia.id)
