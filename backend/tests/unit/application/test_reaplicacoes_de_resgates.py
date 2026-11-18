from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.confirmar_reaplicacao_de_resgate import ConfirmarReaplicacaoDeResgate
from gastoba.application.consultar_progresso_das_metas import ConsultarProgressoDasMetas
from gastoba.application.remover_reaplicacao_de_resgate import RemoverReaplicacaoDeResgate
from gastoba.domain.conta import Conta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    MovimentoDeInvestimentoNaoEncontrado,
    ReaplicacaoInvalida,
    ReaplicacaoJaExiste,
    TransacaoImportadaInvalida,
)
from gastoba.domain.mes import Mes
from gastoba.domain.meta import AlvoDaMeta, Meta
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.portas import InvestimentoExterno


@pytest.fixture
def cenario(unidade_de_trabalho):
    uow = unidade_de_trabalho
    pessoa = uuid4()
    conta = Conta(pessoa, "Carteira fictícia", Dinheiro(123456))
    with uow as u:
        u.contas.adicionar(conta)
        for codigo in ["origem", "destino"]:
            u.investimentos.salvar_posicao(
                pessoa,
                InvestimentoExterno(codigo, codigo, "FIXED_INCOME", None, Dinheiro(10000), "{}"),
            )
        u.metas.salvar(Meta(pessoa, AlvoDaMeta.LIBERDADE_FINANCEIRA, 25))
        u.renda_base.definir(pessoa, Dinheiro(50000))
        u.commit()
    with uow as u:
        origem, destino = u.investimentos.listar_posicoes(pessoa)
        resgate = MovimentoDeInvestimento(
            conta.id,
            TipoDeMovimento.RESGATE,
            Dinheiro(10000),
            "Resgate fictício",
            date(2026, 10, 31),
            origem.id,
        )
        aporte = MovimentoDeInvestimento(
            conta.id,
            TipoDeMovimento.APORTE,
            Dinheiro(15000),
            "Aporte fictício",
            date(2026, 11, 1),
            destino.id,
        )
        for movimento in [resgate, aporte]:
            u.movimentos_de_investimento.adicionar(movimento)
        u.commit()
    return uow, pessoa, conta, resgate, aporte


def progresso(uow, pessoa, mes=11):
    return ConsultarProgressoDasMetas(uow).executar(pessoa, Mes(2026, mes)).progressos[0].gasto


def test_reaplicacao_parcial_reduz_so_o_mes_do_aporte_e_desfazer_restaura(cenario):
    uow, pessoa, conta, resgate, aporte = cenario
    assert progresso(uow, pessoa) == Dinheiro(15000)
    vinculo = ConfirmarReaplicacaoDeResgate(uow).executar(
        pessoa, aporte.id, resgate.id, Dinheiro(10000)
    )
    assert progresso(uow, pessoa) == Dinheiro(5000)
    assert progresso(uow, pessoa, 10) == Dinheiro(0)
    assert uow.confirmado.contas[conta.id].saldo == Dinheiro(123456)
    assert uow.confirmado.movimentos_de_investimento[aporte.id].valor == Dinheiro(15000)
    RemoverReaplicacaoDeResgate(uow).executar(pessoa, vinculo.id)
    assert progresso(uow, pessoa) == Dinheiro(15000)


@pytest.mark.parametrize("valor", [0, -1, 10001, 15001])
def test_valor_invalido_nao_grava(cenario, valor):
    uow, pessoa, _, resgate, aporte = cenario
    with pytest.raises(ReaplicacaoInvalida):
        ConfirmarReaplicacaoDeResgate(uow).executar(pessoa, aporte.id, resgate.id, Dinheiro(valor))
    assert progresso(uow, pessoa) == Dinheiro(15000)


def test_duplicacao_e_isolamento(cenario):
    uow, pessoa, _, resgate, aporte = cenario
    caso = ConfirmarReaplicacaoDeResgate(uow)
    with pytest.raises(MovimentoDeInvestimentoNaoEncontrado):
        caso.executar(uuid4(), aporte.id, resgate.id, Dinheiro(5000))
    caso.executar(pessoa, aporte.id, resgate.id, Dinheiro(5000))
    with pytest.raises(ReaplicacaoJaExiste):
        caso.executar(pessoa, aporte.id, resgate.id, Dinheiro(5000))
    assert progresso(uow, pessoa) == Dinheiro(10000)


@pytest.mark.parametrize(
    "campo,valor",
    [("data", date(2026, 11, 2)), ("investimento_id", None), ("tipo", TipoDeMovimento.RENDIMENTO)],
)
def test_resgate_incompativel_e_recusado(cenario, campo, valor):
    uow, pessoa, _, resgate, aporte = cenario
    setattr(uow.confirmado.movimentos_de_investimento[resgate.id], campo, valor)
    with pytest.raises(ReaplicacaoInvalida):
        ConfirmarReaplicacaoDeResgate(uow).executar(pessoa, aporte.id, resgate.id, Dinheiro(5000))


def preparar_compra(cenario):
    from gastoba.domain.categoria import CategoriaDoGasto
    from gastoba.domain.destinacao import ParteDeDestinacao
    from gastoba.domain.gasto import Gasto
    from gastoba.domain.tag import Tag

    uow, _, conta, resgate, _ = cenario
    compra = Gasto(
        conta.id, Dinheiro(10000), "Compra fictícia", date(2026, 11, 2), CategoriaDoGasto.LAZER, ()
    )
    with uow as u:
        u.gastos.adicionar(compra)
        u.destinacoes.adicionar(
            resgate.id, [ParteDeDestinacao(Tag("objetivo"), Dinheiro(-10000), Dinheiro(-10000))]
        )
        u.commit()
    return compra


def test_cobertura_nao_reutiliza_parcela_reaplicada(cenario):
    from gastoba.application.associar_compra_a_destinacao import AssociarCompraADestinacao
    from gastoba.domain.excecoes import CoberturaInvalida

    compra = preparar_compra(cenario)
    uow, pessoa, _, resgate, aporte = cenario
    ConfirmarReaplicacaoDeResgate(uow).executar(pessoa, aporte.id, resgate.id, Dinheiro(7000))
    cobrir = AssociarCompraADestinacao(uow)
    with pytest.raises(CoberturaInvalida):
        cobrir.executar(pessoa, compra.id, "objetivo", Dinheiro(3001), resgate.id)
    cobrir.executar(pessoa, compra.id, "objetivo", Dinheiro(3000), resgate.id)


def test_reaplicacao_respeita_coberturas_anteriores(cenario):
    from gastoba.application.associar_compra_a_destinacao import AssociarCompraADestinacao

    compra = preparar_compra(cenario)
    uow, pessoa, _, resgate, aporte = cenario
    AssociarCompraADestinacao(uow).executar(
        pessoa, compra.id, "objetivo", Dinheiro(3000), resgate.id
    )
    with pytest.raises(ReaplicacaoInvalida):
        ConfirmarReaplicacaoDeResgate(uow).executar(pessoa, aporte.id, resgate.id, Dinheiro(7001))
    ConfirmarReaplicacaoDeResgate(uow).executar(pessoa, aporte.id, resgate.id, Dinheiro(7000))


def test_candidatos_nao_inferem_vinculo_e_movimentos_vinculados_bloqueiam_reversao(cenario):
    from gastoba.application.desfazer_classificacao_de_investimento import reverter_grupo
    from gastoba.application.listar_resgates_para_reaplicar import ListarResgatesParaReaplicar
    from gastoba.domain.excecoes import MovimentoNaoDesfazivel
    from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

    uow, pessoa, conta, resgate, aporte = cenario
    candidatos = ListarResgatesParaReaplicar(uow).executar(pessoa, aporte.id)
    assert [r.movimento.id for r in candidatos] == [resgate.id]
    assert progresso(uow, pessoa) == Dinheiro(15000)
    ConfirmarReaplicacaoDeResgate(uow).executar(pessoa, aporte.id, resgate.id, Dinheiro(10000))
    assert ListarResgatesParaReaplicar(uow).executar(pessoa, aporte.id) == []
    transacao = TransacaoImportada(
        conta.id, "exemplo", aporte.data, "Exemplo", aporte.valor, SentidoDaTransacao.SAIDA
    )
    with uow as u, pytest.raises(MovimentoNaoDesfazivel, match="reaplicação"):
        reverter_grupo(u, pessoa, transacao, [], [], [aporte])


def test_reaplicacao_altera_versao_da_previa_sem_alterar_movimentos(cenario):
    from gastoba.application.consultar_impacto_da_reversao import impacto_do_grupo
    from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

    uow, pessoa, conta, resgate, aporte = cenario
    transacao = TransacaoImportada(
        conta.id, "previa", aporte.data, "Exemplo", aporte.valor, SentidoDaTransacao.SAIDA
    )
    with uow as u:
        antes = impacto_do_grupo(u, pessoa, transacao, [aporte])
    vinculo = ConfirmarReaplicacaoDeResgate(uow).executar(
        pessoa, aporte.id, resgate.id, Dinheiro(5000)
    )
    with uow as u:
        depois = impacto_do_grupo(u, pessoa, transacao, [aporte])
    assert depois.versao != antes.versao
    assert depois.lancamentos_removidos == antes.lancamentos_removidos
    RemoverReaplicacaoDeResgate(uow).executar(pessoa, vinculo.id)
    with uow as u:
        restaurado = impacto_do_grupo(u, pessoa, transacao, [aporte])
    assert restaurado.versao == antes.versao


def test_total_do_inicio_usa_dinheiro_novo_mesmo_sem_meta(cenario):
    uow, pessoa, _, resgate, aporte = cenario
    with uow as u:
        u.metas.remover(pessoa, AlvoDaMeta.LIBERDADE_FINANCEIRA)
        u.commit()
    caso = ConsultarProgressoDasMetas(uow)
    assert caso.executar(pessoa, Mes(2026, 11)).aportes_do_mes == Dinheiro(15000)
    ConfirmarReaplicacaoDeResgate(uow).executar(pessoa, aporte.id, resgate.id, Dinheiro(10000))
    resumo = caso.executar(pessoa, Mes(2026, 11))
    assert resumo.aportes_do_mes == Dinheiro(5000)
    assert resumo.progressos == ()
    assert caso.executar(pessoa, Mes(2026, 10)).aportes_do_mes == Dinheiro(0)


def test_vencimento_e_explicito_e_nao_muda_a_meta(cenario):
    from gastoba.application.classificar_natureza_do_resgate import ClassificarNaturezaDoResgate

    uow, pessoa, _, resgate, aporte = cenario
    caso = ClassificarNaturezaDoResgate(uow)
    caso.executar(pessoa, resgate.id, True)
    assert uow.confirmado.movimentos_de_investimento[resgate.id].vencimento_confirmado
    assert progresso(uow, pessoa) == Dinheiro(15000)
    caso.executar(pessoa, resgate.id, False)
    assert not uow.confirmado.movimentos_de_investimento[resgate.id].vencimento_confirmado
    with pytest.raises(MovimentoDeInvestimentoNaoEncontrado):
        caso.executar(uuid4(), resgate.id, True)
    with pytest.raises(TransacaoImportadaInvalida):
        caso.executar(pessoa, aporte.id, True)
