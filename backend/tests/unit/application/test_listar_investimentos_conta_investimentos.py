"""A posição da conta investimentos (``CAIXINHA``) mostra só o saldo do banco (071, RF-004)."""

from datetime import date
from uuid import uuid4

from gastoba.application.listar_investimentos import ListarInvestimentos
from gastoba.domain.alocacao_de_caixinha import AlocacaoDeCaixinha
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.destinacao import ParteDeDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag

USUARIO = uuid4()
HOJE = date(2026, 11, 10)


def _conta_investimentos(uow, saldo=82388):
    externo = InvestimentoExterno(
        "c", "Conta investimentos", "CAIXINHA", None, Dinheiro(saldo), "{}"
    )
    with uow as u:
        u.investimentos.salvar_posicao(USUARIO, externo)
        u.commit()
    with uow as u:
        return u.investimentos.listar_posicoes(USUARIO)[0]


def test_sem_movimentos_mostra_o_saldo_do_banco_sem_estimativa(unidade_de_trabalho):
    _conta_investimentos(unidade_de_trabalho)

    [posicao] = ListarInvestimentos(unidade_de_trabalho).executar(USUARIO, hoje=HOJE)

    assert posicao.investimento.saldo == Dinheiro(82388)
    assert [(d.tag, d.valor_atual) for d in posicao.destinacoes] == [(None, Dinheiro(82388))]
    assert posicao.valor_aplicado is None and posicao.rendimento is None
    assert posicao.origem_da_rentabilidade is None
    assert posicao.rentabilidade is None


def test_principal_antigo_registrado_nao_vira_estimativa_na_conta_investimentos(
    unidade_de_trabalho,
):
    caixinha = _conta_investimentos(unidade_de_trabalho)
    conta = Conta(USUARIO, "Banco", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE)
    movimento = MovimentoDeInvestimento(
        conta.id,
        TipoDeMovimento.APORTE,
        Dinheiro(80000),
        "Aporte antigo",
        date(2026, 10, 1),
        investimento_id=caixinha.id,
    )
    with unidade_de_trabalho as u:
        u.contas.adicionar(conta)
        u.movimentos_de_investimento.adicionar(movimento)
        u.destinacoes.adicionar(movimento.id, [ParteDeDestinacao(Tag("reserva"), Dinheiro(80000))])
        u.commit()

    [posicao] = ListarInvestimentos(unidade_de_trabalho).executar(USUARIO, hoje=HOJE)

    assert posicao.investimento.saldo == Dinheiro(82388)
    assert posicao.valor_aplicado is None and posicao.rendimento is None
    assert posicao.origem_da_rentabilidade is None
    assert posicao.rentabilidade is None


def test_a_divisao_por_fracao_continua_valendo_sobre_o_saldo_novo(unidade_de_trabalho):
    caixinha = _conta_investimentos(unidade_de_trabalho, saldo=100000)
    reserva, viagem = Tag("reserva"), Tag("viagem")
    ids = {reserva: uuid4(), viagem: uuid4()}
    for tag, id_da_tag in ids.items():
        unidade_de_trabalho.confirmado.tags_cadastradas[(USUARIO, tag)] = id_da_tag
    with unidade_de_trabalho as u:
        u.alocacoes.substituir(
            USUARIO,
            caixinha.id,
            [
                AlocacaoDeCaixinha(caixinha.id, ids[reserva], 60000),
                AlocacaoDeCaixinha(caixinha.id, ids[viagem], 40000),
            ],
        )
        u.commit()

    [posicao] = ListarInvestimentos(unidade_de_trabalho).executar(USUARIO, hoje=HOJE)

    assert posicao.alocacao_por_fracao is True
    assert {d.tag: d.valor_atual for d in posicao.destinacoes} == {
        reserva: Dinheiro(60000),
        viagem: Dinheiro(40000),
    }
    assert posicao.valor_aplicado is None and posicao.origem_da_rentabilidade is None
