from datetime import date
from uuid import uuid4

import pytest

from gastoba.domain.conta import Conta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ContaNaoEncontrada
from gastoba.domain.ganho import Ganho, OrigemDoGanho
from gastoba.domain.tag import Tag
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


@pytest.fixture
def uow(fabrica_de_sessoes):
    return UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)


def _usuario_com_conta(uow, nome="Ana", saldo=None):
    usuario = Usuario(nome)
    saldo = saldo if saldo is not None else Dinheiro(1000)
    conta = Conta(usuario_id=usuario.id, nome="Carteira", saldo=saldo)
    with uow:
        uow.usuarios.garantir(usuario)
        uow.contas.adicionar(conta)
        uow.commit()
    return usuario, conta


def _ganho(conta, descricao="Salário", data=date(2026, 10, 5), tags=()):
    return Ganho(conta_id=conta.id, valor=Dinheiro(500), descricao=descricao, data=data, tags=tags)


def test_grava_e_lista_o_ganho_com_todos_os_campos(uow):
    usuario, conta = _usuario_com_conta(uow)
    ganho = _ganho(conta, tags=(Tag("pix"), Tag("salario")))
    with uow:
        uow.ganhos.adicionar(ganho)
        uow.commit()

    with uow:
        [lido] = uow.ganhos.listar(usuario.id, date(2026, 10, 1), date(2026, 10, 31))

    assert lido == ganho
    assert lido.valor == Dinheiro(500)
    assert lido.descricao == "Salário"
    assert lido.data == date(2026, 10, 5)
    assert lido.tags == (Tag("pix"), Tag("salario"))
    assert lido.origem == OrigemDoGanho.MANUAL


def test_lista_so_o_periodo_por_data_decrescente_e_filtra_por_conta(uow):
    usuario, conta = _usuario_com_conta(uow)
    with uow:
        uow.ganhos.adicionar(_ganho(conta, "Antigo", date(2026, 9, 30)))
        uow.ganhos.adicionar(_ganho(conta, "Dia 1", date(2026, 10, 1)))
        uow.ganhos.adicionar(_ganho(conta, "Dia 20", date(2026, 10, 20)))
        uow.commit()

    with uow:
        ganhos = uow.ganhos.listar(usuario.id, date(2026, 10, 1), date(2026, 10, 31))
        da_conta = uow.ganhos.listar(
            usuario.id, date(2026, 10, 1), date(2026, 10, 31), conta_id=conta.id
        )
        de_outra = uow.ganhos.listar(
            usuario.id, date(2026, 10, 1), date(2026, 10, 31), conta_id=uuid4()
        )

    assert [g.descricao for g in ganhos] == ["Dia 20", "Dia 1"]
    assert [g.descricao for g in da_conta] == ["Dia 20", "Dia 1"]
    assert de_outra == []


def test_nao_enxerga_ganhos_de_outro_usuario(uow):
    _, conta = _usuario_com_conta(uow, "Ana")
    outro, _ = _usuario_com_conta(uow, "Bia")
    with uow:
        uow.ganhos.adicionar(_ganho(conta))
        uow.commit()

    with uow:
        assert uow.ganhos.listar(outro.id, date(2026, 10, 1), date(2026, 10, 31)) == []


def test_creditar_soma_ao_saldo_de_forma_atomica(uow):
    usuario, conta = _usuario_com_conta(uow, saldo=Dinheiro(-300))
    with uow:
        uow.contas.creditar(conta.id, Dinheiro(250))
        uow.contas.creditar(conta.id, Dinheiro(100))
        uow.commit()

    with uow:
        assert uow.contas.obter(usuario.id, conta.id).saldo == Dinheiro(50)


def test_creditar_conta_inexistente_levanta_conta_nao_encontrada(uow):
    with uow, pytest.raises(ContaNaoEncontrada):
        uow.contas.creditar(uuid4(), Dinheiro(1))


def test_sem_commit_o_ganho_e_o_credito_sao_desfeitos(uow):
    usuario, conta = _usuario_com_conta(uow)
    with uow:
        uow.ganhos.adicionar(_ganho(conta))
        uow.contas.creditar(conta.id, Dinheiro(500))

    with uow:
        assert uow.ganhos.listar(usuario.id, date(2026, 10, 1), date(2026, 10, 31)) == []
        assert uow.contas.obter(usuario.id, conta.id).saldo == Dinheiro(1000)
