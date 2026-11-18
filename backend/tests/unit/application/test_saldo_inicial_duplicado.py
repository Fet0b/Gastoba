from datetime import date
from uuid import uuid4

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.definir_destinacoes_do_investimento import (
    DefinirDestinacoesDoInvestimento,
)
from gastoba.application.listar_movimentos_de_investimento import ListarMovimentosDeInvestimento
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import OrigemDoMovimento
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

USUARIO = uuid4()
# O relógio do conftest marca 2026-10-12: é a data do saldo inicial.
DIA_DO_SALDO_INICIAL = date(2026, 10, 12)


def destinos(**percentuais):
    return [Destinacao(Tag.de_texto(t), p) for t, p in percentuais.items()]


def montar(unidade_de_trabalho, relogio, **percentuais):
    """Ação com saldo e aplicado de R$ 2.789,25 e o saldo inicial já criado."""
    conta = Conta(USUARIO, "BTG", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE)
    acao = InvestimentoExterno(
        "aupo11",
        "AUPO11",
        "EQUITY",
        "ETF",
        Dinheiro(278925),
        "{}",
        valor_aplicado=Dinheiro(278925),
    )
    with unidade_de_trabalho as u:
        u.contas.adicionar(conta)
        u.investimentos.salvar_posicao(USUARIO, acao)
        u.commit()
    with unidade_de_trabalho as u:
        investimento = u.investimentos.listar_posicoes(USUARIO)[0]
    DefinirDestinacoesDoInvestimento(unidade_de_trabalho, relogio).executar(
        USUARIO, investimento.id, destinos(**percentuais)
    )
    return conta, investimento


def comprar(unidade_de_trabalho, conta, investimento, valor, dia, **percentuais):
    t = TransacaoImportada(
        conta.id,
        f"t{dia}",
        dia,
        "LIQ BOLSA - VISTA BRUTO",
        Dinheiro(valor),
        SentidoDaTransacao.SAIDA,
    )
    with unidade_de_trabalho as u:
        u.transacoes_importadas.adicionar_se_nova(t)
        u.commit()
    AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO,
        t.id,
        None,
        [],
        como_investimento=True,
        investimento_id=investimento.id,
        destinacoes=destinos(**percentuais),
    )


def principais(unidade_de_trabalho, investimento):
    with unidade_de_trabalho as u:
        dele = u.destinacoes.principais(USUARIO).get(investimento.id, {})
        return {str(t): v.centavos for t, v in dele.items()}


def saldos_iniciais(unidade_de_trabalho):
    movimentos = ListarMovimentosDeInvestimento(unidade_de_trabalho).executar(
        USUARIO, date(2026, 1, 1), date(2026, 12, 31)
    )
    return [m for m in movimentos if m.movimento.origem == OrigemDoMovimento.SALDO_INICIAL]


def test_compra_real_anterior_ao_saldo_inicial_substitui_o_saldo_inicial(
    unidade_de_trabalho, relogio
):
    conta, acao = montar(unidade_de_trabalho, relogio, patrimonio=100)
    comprar(unidade_de_trabalho, conta, acao, 278930, date(2026, 10, 11), patrimonio=100)
    assert principais(unidade_de_trabalho, acao) == {"patrimonio": 278930}
    assert saldos_iniciais(unidade_de_trabalho) == []


def test_compra_real_abate_so_o_que_o_saldo_inicial_tem(unidade_de_trabalho, relogio):
    conta, acao = montar(unidade_de_trabalho, relogio, patrimonio=60, reserva=40)
    comprar(unidade_de_trabalho, conta, acao, 100000, date(2026, 10, 12), patrimonio=100)
    # Saldo inicial: 278925 (167355 + 111570). Sai 100000 dele, na proporção 60/40.
    restante = saldos_iniciais(unidade_de_trabalho)
    assert [m.movimento.valor.centavos for m in restante] == [178925]
    assert principais(unidade_de_trabalho, acao) == {
        "patrimonio": 100000 + 107355,
        "reserva": 71570,
    }


def test_compra_depois_do_saldo_inicial_e_dinheiro_novo(unidade_de_trabalho, relogio):
    conta, acao = montar(unidade_de_trabalho, relogio, patrimonio=100)
    comprar(unidade_de_trabalho, conta, acao, 50000, date(2026, 10, 13), patrimonio=100)
    assert principais(unidade_de_trabalho, acao) == {"patrimonio": 278925 + 50000}
    assert len(saldos_iniciais(unidade_de_trabalho)) == 1


def test_desfazer_compra_restaura_saldo_inicial_e_rateio_abatidos(unidade_de_trabalho, relogio):
    from gastoba.application.desfazer_classificacao_importada import DesfazerClassificacaoImportada

    uow = unidade_de_trabalho
    conta, acao = montar(uow, relogio, patrimonio=60, reserva=40)
    inicial = saldos_iniciais(uow)[0].movimento
    antes = principais(uow, acao)
    comprar(uow, conta, acao, 100000, date(2026, 10, 12), patrimonio=100)
    with uow as u:
        [compra] = [
            m
            for m in u.movimentos_de_investimento.listar(USUARIO, date.min, date.max)
            if m.origem == OrigemDoMovimento.OPEN_FINANCE
        ]
    DesfazerClassificacaoImportada(uow).executar(USUARIO, compra.transacao_importada_id)
    assert principais(uow, acao) == antes
    [restaurado] = saldos_iniciais(uow)
    assert restaurado.movimento.id == inicial.id
    assert restaurado.movimento.valor == inicial.valor


def test_desfazer_compra_restaura_saldo_inicial_inteiramente_abatido(unidade_de_trabalho, relogio):
    from gastoba.application.desfazer_classificacao_importada import DesfazerClassificacaoImportada

    uow = unidade_de_trabalho
    conta, acao = montar(uow, relogio, patrimonio=100)
    antes = principais(uow, acao)
    comprar(uow, conta, acao, 278930, date(2026, 10, 11), patrimonio=100)
    with uow as u:
        [compra] = u.movimentos_de_investimento.listar(USUARIO, date.min, date.max)
    caso = DesfazerClassificacaoImportada(uow)
    caso.executar(USUARIO, compra.transacao_importada_id)
    assert principais(uow, acao) == antes
    # Reclassificar e desfazer outra vez não restaura duas vezes o snapshot antigo.
    AceitarTransacaoImportada(uow).executar(
        USUARIO,
        compra.transacao_importada_id,
        None,
        [],
        como_investimento=True,
        investimento_id=acao.id,
        destinacoes=destinos(patrimonio=100),
    )
    caso.executar(USUARIO, compra.transacao_importada_id)
    assert principais(uow, acao) == antes


def test_abatimento_posterior_exige_reversao_em_ordem_inversa_e_falha_atomica(
    unidade_de_trabalho, relogio
):
    import copy

    import pytest

    from gastoba.application.desfazer_classificacao_importada import DesfazerClassificacaoImportada
    from gastoba.domain.excecoes import MovimentoNaoDesfazivel

    uow = unidade_de_trabalho
    conta, acao = montar(uow, relogio, patrimonio=60, reserva=40)
    antes = principais(uow, acao)
    comprar(uow, conta, acao, 100000, date(2026, 10, 11), patrimonio=100)
    comprar(uow, conta, acao, 50000, date(2026, 10, 12), patrimonio=100)
    with uow as u:
        compras = sorted(
            [
                m
                for m in u.movimentos_de_investimento.listar(USUARIO, date.min, date.max)
                if m.origem == OrigemDoMovimento.OPEN_FINANCE
            ],
            key=lambda m: m.data,
        )
    estado = copy.deepcopy(uow.confirmado)
    caso = DesfazerClassificacaoImportada(uow)
    with pytest.raises(MovimentoNaoDesfazivel, match="primeiro os aportes posteriores"):
        caso.executar(USUARIO, compras[0].transacao_importada_id)
    assert uow.confirmado == estado
    caso.executar(USUARIO, compras[1].transacao_importada_id)
    caso.executar(USUARIO, compras[0].transacao_importada_id)
    assert principais(uow, acao) == antes


def test_abatimento_total_nao_esconde_aporte_posterior_independente(unidade_de_trabalho, relogio):
    import pytest

    from gastoba.application.desfazer_classificacao_importada import DesfazerClassificacaoImportada
    from gastoba.domain.excecoes import MovimentoNaoDesfazivel

    uow = unidade_de_trabalho
    conta, acao = montar(uow, relogio, patrimonio=100)
    comprar(uow, conta, acao, 278930, date(2026, 10, 11), patrimonio=100)
    comprar(uow, conta, acao, 5000, date(2026, 10, 12), patrimonio=100)
    with uow as u:
        compras = sorted(
            u.movimentos_de_investimento.listar(USUARIO, date.min, date.max), key=lambda m: m.data
        )
    with pytest.raises(MovimentoNaoDesfazivel, match="posteriores"):
        DesfazerClassificacaoImportada(uow).executar(USUARIO, compras[0].transacao_importada_id)


def test_reversao_restaura_varios_saldos_iniciais_abatidos_pelo_mesmo_aporte(
    unidade_de_trabalho, relogio
):
    from gastoba.application.desfazer_classificacao_importada import DesfazerClassificacaoImportada
    from gastoba.domain.destinacao import ParteDeDestinacao
    from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento

    uow = unidade_de_trabalho
    conta, acao = montar(uow, relogio, patrimonio=100)
    extra = MovimentoDeInvestimento.de_saldo_inicial(acao.id, Dinheiro(100000), date(2026, 10, 12))
    with uow as u:
        u.movimentos_de_investimento.adicionar(extra)
        u.destinacoes.adicionar(extra.id, [ParteDeDestinacao(Tag("viagem"), Dinheiro(100000))])
        u.commit()
    antes = principais(uow, acao)
    comprar(uow, conta, acao, 350000, date(2026, 10, 11), patrimonio=100)
    with uow as u:
        compra = next(
            m
            for m in u.movimentos_de_investimento.listar(USUARIO, date.min, date.max)
            if m.origem == OrigemDoMovimento.OPEN_FINANCE
        )
    DesfazerClassificacaoImportada(uow).executar(USUARIO, compra.transacao_importada_id)
    assert principais(uow, acao) == antes
    assert len(saldos_iniciais(uow)) == 2


def test_divisao_restaura_abatimentos_das_duas_partes_na_mesma_transacao(
    unidade_de_trabalho, relogio
):
    from gastoba.application.aceitar_transacao_importada_dividida import (
        AceitarTransacaoImportadaDividida,
    )
    from gastoba.application.desfazer_classificacao_importada import DesfazerClassificacaoImportada
    from gastoba.domain.divisao_da_transacao import ParteDaTransacao

    uow = unidade_de_trabalho
    conta, acao = montar(uow, relogio, patrimonio=60, reserva=40)
    antes = principais(uow, acao)
    t = TransacaoImportada(
        conta.id,
        "dividida",
        date(2026, 10, 11),
        "Compra fictícia",
        Dinheiro(100000),
        SentidoDaTransacao.SAIDA,
    )
    with uow as u:
        u.transacoes_importadas.adicionar_se_nova(t)
        u.commit()
    AceitarTransacaoImportadaDividida(uow).executar(
        USUARIO,
        t.id,
        [
            ParteDaTransacao(
                None,
                (),
                50,
                como_investimento=True,
                investimento_id=acao.id,
                destinacoes=destinos(patrimonio=100),
            ),
            ParteDaTransacao(
                None,
                (),
                50,
                como_investimento=True,
                investimento_id=acao.id,
                destinacoes=destinos(reserva=100),
            ),
        ],
    )
    DesfazerClassificacaoImportada(uow).executar(USUARIO, t.id, desfazer_divisao_inteira=True)
    assert principais(uow, acao) == antes
