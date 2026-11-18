from concurrent.futures import ThreadPoolExecutor
from datetime import date
from threading import Barrier

import pytest
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError

from gastoba.application.confirmar_reaplicacao_de_resgate import ConfirmarReaplicacaoDeResgate
from gastoba.domain.conta import Conta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ReaplicacaoJaExiste
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.persistencia.modelos import MovimentoDeInvestimentoModelo
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


@pytest.fixture
def cenario_reaplicacao(fabrica_de_sessoes):
    uow = UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)
    pessoa = Usuario("Pessoa fictícia")
    conta = Conta(pessoa.id, "Carteira fictícia", Dinheiro(123456))
    with uow as u:
        u.usuarios.garantir(pessoa)
        u.contas.adicionar(conta)
        for codigo in ["origem", "destino"]:
            u.investimentos.salvar_posicao(
                pessoa.id,
                InvestimentoExterno(codigo, codigo, "FIXED_INCOME", None, Dinheiro(10000), "{}"),
            )
        u.commit()
    with uow as u:
        origem, destino = u.investimentos.listar_posicoes(pessoa.id)
        resgate = MovimentoDeInvestimento(
            conta.id,
            TipoDeMovimento.RESGATE,
            Dinheiro(10000),
            "Exemplo",
            date(2026, 10, 31),
            origem.id,
        )
        aporte = MovimentoDeInvestimento(
            conta.id,
            TipoDeMovimento.APORTE,
            Dinheiro(15000),
            "Exemplo",
            date(2026, 11, 1),
            destino.id,
        )
        for m in [resgate, aporte]:
            u.movimentos_de_investimento.adicionar(m)
        u.commit()
    return uow, pessoa, conta, resgate, aporte


def test_persiste_isola_e_soma_na_competencia_do_aporte(cenario_reaplicacao):
    uow, pessoa, conta, resgate, aporte = cenario_reaplicacao
    vinculo = ConfirmarReaplicacaoDeResgate(uow).executar(
        pessoa.id, aporte.id, resgate.id, Dinheiro(10000)
    )
    with uow as u:
        assert u.reaplicacoes_de_resgates.obter(pessoa.id, vinculo.id) == vinculo
        assert u.reaplicacoes_de_resgates.listar(Usuario("Outra").id) == []
        assert u.reaplicacoes_de_resgates.somar_no_periodo(
            pessoa.id, date(2026, 11, 1), date(2026, 11, 30)
        ) == Dinheiro(10000)
        assert u.reaplicacoes_de_resgates.somar_no_periodo(
            pessoa.id, date(2026, 10, 1), date(2026, 10, 31)
        ) == Dinheiro(0)
        assert u.contas.obter(pessoa.id, conta.id).saldo == Dinheiro(123456)


def test_fk_impede_excluir_ponta_vinculada(cenario_reaplicacao, fabrica_de_sessoes):
    uow, pessoa, _, resgate, aporte = cenario_reaplicacao
    ConfirmarReaplicacaoDeResgate(uow).executar(pessoa.id, aporte.id, resgate.id, Dinheiro(10000))
    with pytest.raises(IntegrityError), fabrica_de_sessoes.begin() as sessao:
        sessao.execute(
            delete(MovimentoDeInvestimentoModelo).where(
                MovimentoDeInvestimentoModelo.id == resgate.id
            )
        )


def test_concorrencia_nao_reutiliza_resgate(cenario_reaplicacao, fabrica_de_sessoes):
    _, pessoa, _, resgate, aporte = cenario_reaplicacao
    barreira = Barrier(2)

    def confirmar(_):
        barreira.wait()
        try:
            ConfirmarReaplicacaoDeResgate(UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)).executar(
                pessoa.id, aporte.id, resgate.id, Dinheiro(10000)
            )
            return "criada"
        except ReaplicacaoJaExiste:
            return "duplicada"

    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(confirmar, [0, 1])) == ["criada", "duplicada"]
