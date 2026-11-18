"""Contas do banco com o mesmo nome (ex.: duas do BTG) contra o SQLite de verdade."""

from datetime import UTC, datetime

import pytest

from gastoba.application.sincronizar_contas_bancarias import SincronizarContasBancarias
from gastoba.domain.conta import OrigemDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.email import Email
from gastoba.domain.portas import ContaExterna
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy

EMAIL = "dono@exemplo.com"


class RelogioFixo:
    def agora(self):
        return datetime(2026, 10, 22, 12, 0, tzinfo=UTC)


class ProvedorFalso:
    def __init__(self, contas):
        self._contas = contas

    def listar_contas(self, id_do_item):
        return self._contas

    def listar_operacoes_do_investimento(self, id_do_investimento):
        return []

    def listar_investimentos(self, id_do_item):
        return []

    def listar_transacoes(self, id_da_conta, desde):
        return []


@pytest.fixture
def uow(fabrica_de_sessoes):
    return UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)


def test_contas_com_o_mesmo_nome_entram_todas_com_sufixo_no_repetido(uow):
    dono = Usuario("Dono", email=Email.de_texto(EMAIL))
    with uow:
        uow.usuarios.salvar(dono)
        uow.commit()
    provedor = ProvedorFalso(
        [
            ContaExterna("aaaaaa-1", "BTG Investimentos", Dinheiro(0)),
            ContaExterna("bbbbbb-2", "BTG Investimentos", Dinheiro(2100)),
            ContaExterna("cccccc-3", "BTG Banking", Dinheiro(0)),
            ContaExterna("dddddd-4", "BTG Banking", Dinheiro(0)),
        ]
    )

    resultado = SincronizarContasBancarias(
        uow, provedor, RelogioFixo(), ("item-1",), EMAIL, 30
    ).executar()

    assert (resultado.contas, resultado.falhas) == (4, 0)
    with uow:
        contas = uow.contas.listar(dono.id)
    assert len(contas) == 4
    assert {c.id_externo for c in contas} == {"aaaaaa-1", "bbbbbb-2", "cccccc-3", "dddddd-4"}
    assert all(c.origem == OrigemDaConta.OPEN_FINANCE for c in contas)
    assert sorted(c.nome for c in contas) == [
        "BTG Banking",
        "BTG Banking (2)",
        "BTG Investimentos",
        "BTG Investimentos (2)",
    ]
    assert {c.saldo for c in contas if c.id_externo == "bbbbbb-2"} == {Dinheiro(2100)}
