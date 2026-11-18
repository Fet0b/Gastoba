from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.verificar_gestao_de_investimentos import VerificarGestaoDeInvestimentos
from gastoba.domain.conta import Conta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.portas import InvestimentoExterno


@pytest.mark.parametrize("tipo", ["vazio", "posicao", "movimento", "saldo_inicial"])
def test_gestao_reflete_so_investimentos_ou_movimentos_da_pessoa(unidade_de_trabalho, tipo):
    usuario, outro = uuid4(), uuid4()
    with unidade_de_trabalho as u:
        if tipo in ["posicao", "saldo_inicial"]:
            u.investimentos.salvar_posicao(
                usuario,
                InvestimentoExterno("i1", "Exemplo", "FIXED_INCOME", None, Dinheiro(100), "{}"),
            )
            investimento = u.investimentos.listar_posicoes(usuario)[0]
            if tipo == "saldo_inicial":
                u.movimentos_de_investimento.adicionar(
                    MovimentoDeInvestimento.de_saldo_inicial(
                        investimento.id, Dinheiro(100), date(2026, 10, 5)
                    )
                )
        if tipo == "movimento":
            conta = Conta(usuario, "Banco exemplo", Dinheiro(0))
            u.contas.adicionar(conta)
            u.movimentos_de_investimento.adicionar(
                MovimentoDeInvestimento(
                    conta.id, TipoDeMovimento.APORTE, Dinheiro(100), "Exemplo", date(2026, 10, 5)
                )
            )
        u.commit()
    caso = VerificarGestaoDeInvestimentos(unidade_de_trabalho)
    assert caso.executar(usuario) is (tipo != "vazio")
    assert caso.executar(outro) is False
