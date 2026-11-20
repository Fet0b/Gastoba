from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.associar_movimento_ao_investimento import (
    AssociarMovimentoAoInvestimento,
)
from gastoba.application.definir_destinacoes_do_investimento import (
    DefinirDestinacoesDoInvestimento,
)
from gastoba.application.listar_movimentos_de_investimento import ListarMovimentosDeInvestimento
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    DestinacaoInvalida,
    InvestimentoNaoEncontrado,
    MovimentoJaAssociado,
    SemValorADestinar,
)
from gastoba.domain.movimento_de_investimento import OrigemDoMovimento, TipoDeMovimento
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

USUARIO = uuid4()
OUTRO = uuid4()
# AGORA, do conftest, é 2026-10-12 12:00 UTC: 09:00 em Brasília, no mesmo dia.
HOJE = date(2026, 10, 12)


def destinos(**percentuais):
    return [Destinacao(Tag.de_texto(t), p) for t, p in percentuais.items()]


def montar(uow, saldo=41001, valor_aplicado=40000):
    conta = Conta(USUARIO, "Banco", Dinheiro(500000), origem=OrigemDaConta.OPEN_FINANCE)
    externo = InvestimentoExterno(
        "lci",
        "LCI BTG",
        "FIXED_INCOME",
        "LCI",
        Dinheiro(saldo),
        "{}",
        valor_aplicado=None if valor_aplicado is None else Dinheiro(valor_aplicado),
    )
    with uow as u:
        u.contas.adicionar(conta)
        u.investimentos.salvar_posicao(USUARIO, externo)
        u.commit()
    with uow as u:
        investimento = u.investimentos.listar_posicoes(USUARIO)[0]
    return conta, investimento


def aportar(uow, conta, investimento, valor, **percentuais):
    t = TransacaoImportada(
        conta.id, "t1", HOJE, "Aplicação", Dinheiro(valor), SentidoDaTransacao.SAIDA
    )
    with uow as u:
        u.transacoes_importadas.adicionar_se_nova(t)
        u.commit()
    AceitarTransacaoImportada(uow).executar(
        USUARIO,
        t.id,
        None,
        [],
        como_investimento=True,
        investimento_id=investimento.id,
        destinacoes=destinos(**percentuais),
    )


def principais(uow, investimento):
    with uow as u:
        return {
            str(t): v.centavos
            for t, v in u.destinacoes.principais(USUARIO).get(investimento.id, {}).items()
        }


def test_destina_o_valor_aplicado_que_ainda_nao_tem_principal(unidade_de_trabalho, relogio):
    conta, inv = montar(unidade_de_trabalho)
    aportar(unidade_de_trabalho, conta, inv, 10000, casa=100)

    resultado = DefinirDestinacoesDoInvestimento(unidade_de_trabalho, relogio).executar(
        USUARIO, inv.id, destinos(reserva=50, viagem=50)
    )

    m = resultado.movimento
    assert m.conta_id is None
    assert (m.tipo, m.origem) == (TipoDeMovimento.APORTE, OrigemDoMovimento.SALDO_INICIAL)
    assert (m.descricao, m.data, m.valor) == ("Saldo inicial", HOJE, Dinheiro(30000))
    assert m.investimento_id == inv.id
    assert [(str(t), v.centavos) for t, v in resultado.destinacoes] == [
        ("reserva", 15000),
        ("viagem", 15000),
    ]
    assert principais(unidade_de_trabalho, inv) == {
        "casa": 10000,
        "reserva": 15000,
        "viagem": 15000,
    }


def test_sem_valor_aplicado_a_base_e_o_saldo(unidade_de_trabalho, relogio):
    _, inv = montar(unidade_de_trabalho, saldo=41001, valor_aplicado=None)

    resultado = DefinirDestinacoesDoInvestimento(unidade_de_trabalho, relogio).executar(
        USUARIO, inv.id, destinos(casa=100)
    )

    assert resultado.movimento.valor == Dinheiro(41001)


def test_saldo_inicial_nao_entra_nos_aportes_da_meta_e_aparece_nos_movimentos(
    unidade_de_trabalho, relogio
):
    _, inv = montar(unidade_de_trabalho)

    DefinirDestinacoesDoInvestimento(unidade_de_trabalho, relogio).executar(
        USUARIO, inv.id, destinos(casa=100)
    )

    with unidade_de_trabalho as u:
        assert u.movimentos_de_investimento.somar_aportes(USUARIO, HOJE, HOJE) == Dinheiro(0)
    [item] = ListarMovimentosDeInvestimento(unidade_de_trabalho).executar(USUARIO, HOJE, HOJE)
    assert item.movimento.origem == OrigemDoMovimento.SALDO_INICIAL
    assert [(str(t), v.centavos) for t, v in item.destinacoes] == [("casa", 40000)]
    assert ListarMovimentosDeInvestimento(unidade_de_trabalho).executar(OUTRO, HOJE, HOJE) == []
    with pytest.raises(MovimentoJaAssociado):
        AssociarMovimentoAoInvestimento(unidade_de_trabalho).executar(
            USUARIO, item.movimento.id, inv.id, destinos(casa=100)
        )


def test_nada_a_destinar_da_sem_valor_a_destinar(unidade_de_trabalho, relogio):
    conta, inv = montar(unidade_de_trabalho)
    caso = DefinirDestinacoesDoInvestimento(unidade_de_trabalho, relogio)
    caso.executar(USUARIO, inv.id, destinos(casa=100))

    with pytest.raises(SemValorADestinar):
        caso.executar(USUARIO, inv.id, destinos(casa=100))

    # O valor aplicado menor que o principal já registrado também não deixa nada a destinar.
    cdb = montar_cdb_com_aporte_maior_que_o_aplicado(unidade_de_trabalho, conta)
    with pytest.raises(SemValorADestinar):
        caso.executar(USUARIO, cdb.id, destinos(casa=100))


def montar_cdb_com_aporte_maior_que_o_aplicado(uow, conta):
    externo = InvestimentoExterno(
        "cdb", "CDB X", "FIXED_INCOME", "CDB", Dinheiro(5000), "{}", valor_aplicado=Dinheiro(5000)
    )
    with uow as u:
        u.investimentos.salvar_posicao(USUARIO, externo)
        u.commit()
    with uow as u:
        cdb = next(p for p in u.investimentos.listar_posicoes(USUARIO) if p.id_externo == "cdb")
    t = TransacaoImportada(conta.id, "t9", HOJE, "CDB", Dinheiro(6000), SentidoDaTransacao.SAIDA)
    with uow as u:
        u.transacoes_importadas.adicionar_se_nova(t)
        u.commit()
    AceitarTransacaoImportada(uow).executar(
        USUARIO,
        t.id,
        None,
        [],
        como_investimento=True,
        investimento_id=cdb.id,
        destinacoes=destinos(casa=100),
    )
    return cdb


def test_investimento_de_outro_usuario_ou_inexistente_da_nao_encontrado(
    unidade_de_trabalho, relogio
):
    _, inv = montar(unidade_de_trabalho)
    caso = DefinirDestinacoesDoInvestimento(unidade_de_trabalho, relogio)

    with pytest.raises(InvestimentoNaoEncontrado):
        caso.executar(OUTRO, inv.id, destinos(casa=100))
    with pytest.raises(InvestimentoNaoEncontrado):
        caso.executar(USUARIO, uuid4(), destinos(casa=100))
    assert unidade_de_trabalho.confirmado.movimentos_de_investimento == {}


@pytest.mark.parametrize(
    "destinacoes",
    [destinos(casa=50, viagem=40), [], destinos(casa=50) + destinos(casa=50)],
)
def test_destinacoes_invalidas_sao_recusadas_sem_gravar(unidade_de_trabalho, relogio, destinacoes):
    _, inv = montar(unidade_de_trabalho)

    with pytest.raises(DestinacaoInvalida):
        DefinirDestinacoesDoInvestimento(unidade_de_trabalho, relogio).executar(
            USUARIO, inv.id, destinacoes
        )

    assert unidade_de_trabalho.confirmado.movimentos_de_investimento == {}
    assert unidade_de_trabalho.confirmado.destinacoes == []


def test_desfazer_o_saldo_inicial_tira_a_abertura_estimada_do_modelo_novo(
    unidade_de_trabalho, relogio
):
    from decimal import Decimal

    from gastoba.application.desfazer_saldo_inicial import DesfazerSaldoInicial
    from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao

    conta, inv = montar(unidade_de_trabalho)
    resultado = DefinirDestinacoesDoInvestimento(unidade_de_trabalho, relogio).executar(
        USUARIO, inv.id, destinos(casa=100)
    )
    estimada = Operacao(
        posicao_id=inv.id,
        tipo=TipoDeOperacao.ABERTURA,
        data=HOJE,
        quantidade=Decimal("1"),
        valor_bruto=Dinheiro(41001),
        origem=OrigemDaOperacao.ABERTURA,
        quantidade_estimada=True,
    )
    with unidade_de_trabalho as u:
        u.operacoes.adicionar(USUARIO, estimada)
        u.commit()
    DesfazerSaldoInicial(unidade_de_trabalho).executar(USUARIO, resultado.movimento.id)
    with unidade_de_trabalho as u:
        assert u.operacoes.obter(USUARIO, estimada.id) is None
