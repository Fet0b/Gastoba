from datetime import date
from uuid import uuid4

from gastoba.application.listar_investimentos import ListarInvestimentos
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.destinacao import ParteDeDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag

USUARIO = uuid4()


def test_rentabilidade_do_investimento_e_das_destinacoes(unidade_de_trabalho):
    externo = InvestimentoExterno(
        "x",
        "LCI",
        "FIXED_INCOME",
        "LCI",
        Dinheiro(104321),
        "{}",
        valor_aplicado=Dinheiro(100000),
        rendimento=Dinheiro(4321),
    )
    conta = Conta(USUARIO, "Banco", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE)
    movimento = MovimentoDeInvestimento(
        conta.id, TipoDeMovimento.APORTE, Dinheiro(100000), "Aporte", date(2026, 10, 1)
    )
    with unidade_de_trabalho as u:
        u.contas.adicionar(conta)
        u.investimentos.salvar_posicao(USUARIO, externo)
        investimento = u.investimentos.listar_posicoes(USUARIO)[0]
        movimento.investimento_id = investimento.id
        u.movimentos_de_investimento.adicionar(movimento)
        u.destinacoes.adicionar(
            movimento.id,
            [
                ParteDeDestinacao(Tag("casa"), Dinheiro(60000)),
                ParteDeDestinacao(Tag("viagem"), Dinheiro(40000)),
            ],
        )
        u.commit()

    [posicao] = ListarInvestimentos(unidade_de_trabalho).executar(USUARIO)

    assert posicao.rentabilidade == "4.32"
    assert posicao.investimento.rendimento == Dinheiro(4321)
    por_tag = {str(d.tag): (d.rendimento.centavos, d.rentabilidade) for d in posicao.destinacoes}
    assert por_tag == {"casa": (2593, "4.32"), "viagem": (1728, "4.32")}
    assert sum(r for r, _ in por_tag.values()) == 4321


def test_sem_informacao_da_instituicao_nao_ha_rentabilidade_do_investimento(unidade_de_trabalho):
    externo = InvestimentoExterno("x", "CDB", "FIXED_INCOME", None, Dinheiro(5000), "{}")
    with unidade_de_trabalho as u:
        u.investimentos.salvar_posicao(USUARIO, externo)
        u.commit()

    [posicao] = ListarInvestimentos(unidade_de_trabalho).executar(USUARIO)

    assert posicao.rentabilidade is None
    assert posicao.destinacoes[0].tag is None
    assert posicao.destinacoes[0].rendimento == Dinheiro(0)
    assert posicao.destinacoes[0].rentabilidade is None


def _posicao_com_aporte(unidade_de_trabalho, externo, aportado):
    conta = Conta(USUARIO, "Banco", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE)
    movimento = MovimentoDeInvestimento(
        conta.id, TipoDeMovimento.APORTE, Dinheiro(aportado), "Aporte", date(2026, 10, 1)
    )
    with unidade_de_trabalho as u:
        u.contas.adicionar(conta)
        u.investimentos.salvar_posicao(USUARIO, externo)
        investimento = u.investimentos.listar_posicoes(USUARIO)[0]
        movimento.investimento_id = investimento.id
        u.movimentos_de_investimento.adicionar(movimento)
        u.destinacoes.adicionar(movimento.id, [ParteDeDestinacao(Tag("casa"), Dinheiro(aportado))])
        u.commit()


def test_sem_informacao_da_instituicao_nao_ha_estimativa_pelos_aportes_registrados(
    unidade_de_trabalho,
):
    """T075: a estimativa pelo principal dos aportes foi retirada; nunca um número inventado."""
    externo = InvestimentoExterno("x", "CDB", "FIXED_INCOME", None, Dinheiro(40095), "{}")
    _posicao_com_aporte(unidade_de_trabalho, externo, 40000)

    [posicao] = ListarInvestimentos(unidade_de_trabalho).executar(USUARIO)

    assert posicao.origem_da_rentabilidade is None
    assert posicao.valor_aplicado is None and posicao.rendimento is None
    assert posicao.rentabilidade is None


def test_a_informacao_da_instituicao_vale_mais_que_a_estimativa_dos_aportes(unidade_de_trabalho):
    externo = InvestimentoExterno(
        "x",
        "CDB",
        "FIXED_INCOME",
        None,
        Dinheiro(40095),
        "{}",
        valor_aplicado=Dinheiro(39000),
        rendimento=Dinheiro(1095),
    )
    _posicao_com_aporte(unidade_de_trabalho, externo, 40000)

    [posicao] = ListarInvestimentos(unidade_de_trabalho).executar(USUARIO)

    assert posicao.origem_da_rentabilidade == "instituicao"
    assert (posicao.valor_aplicado, posicao.rendimento) == (Dinheiro(39000), Dinheiro(1095))
    assert posicao.rentabilidade == "2.80"


def test_sem_instituicao_nem_aportes_nao_ha_origem_da_rentabilidade(unidade_de_trabalho):
    externo = InvestimentoExterno("x", "CDB", "FIXED_INCOME", None, Dinheiro(5000), "{}")
    with unidade_de_trabalho as u:
        u.investimentos.salvar_posicao(USUARIO, externo)
        u.commit()

    [posicao] = ListarInvestimentos(unidade_de_trabalho).executar(USUARIO)

    assert posicao.origem_da_rentabilidade is None
    assert posicao.valor_aplicado is None
    assert posicao.rendimento is None


def test_so_o_valor_aplicado_da_instituicao_continua_sendo_dela(unidade_de_trabalho):
    externo = InvestimentoExterno(
        "x", "CDB", "FIXED_INCOME", None, Dinheiro(40095), "{}", valor_aplicado=Dinheiro(40000)
    )
    _posicao_com_aporte(unidade_de_trabalho, externo, 30000)

    [posicao] = ListarInvestimentos(unidade_de_trabalho).executar(USUARIO)

    assert posicao.origem_da_rentabilidade == "instituicao"
    assert (posicao.valor_aplicado, posicao.rendimento) == (Dinheiro(40000), None)
    assert posicao.rentabilidade is None


def test_a_conta_remunerada_continua_estimada_pelo_principal_registrado(unidade_de_trabalho):
    """T075 retirou a estimativa das posições com operações; a conta remunerada (CAIXINHA), fora do
    modelo de operações (D6), ainda depende dela."""
    externo = InvestimentoExterno("c", "Conta remunerada", "CAIXINHA", None, Dinheiro(40095), "{}")
    _posicao_com_aporte(unidade_de_trabalho, externo, 40000)

    [posicao] = ListarInvestimentos(unidade_de_trabalho).executar(USUARIO)

    assert posicao.origem_da_rentabilidade == "aportes"
    assert (posicao.valor_aplicado, posicao.rendimento) == (Dinheiro(40000), Dinheiro(95))
