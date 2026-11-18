from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.confirmar_propostas_da_bolsa import (
    ConfirmarPropostasDaBolsa,
    ItemDeConfirmacao,
)
from gastoba.application.listar_revisao_da_bolsa import ListarRevisaoDaBolsa
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import CasamentoAmbiguo, RevisaoDesatualizada
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)

PESSOA = uuid4()
BRUTO = "LIQ BOLSA - VISTA BRUTO - PREGÃO: 03/11/2026 - EXEC.: 1"
TAXA = "LIQ BOLSA - VISTA TX CCP/EMOL/TTA B3 - PREGÃO: 03/11/2026"


def _conta(uow, saldo=50000):
    conta = Conta(PESSOA, "Banco", Dinheiro(saldo), origem=OrigemDaConta.OPEN_FINANCE)
    with uow as u:
        u.contas.adicionar(conta)
        u.commit()
    return conta


def _transacao(uow, conta, descricao, centavos, externo, sentido=SentidoDaTransacao.SAIDA, dia=5):
    t = TransacaoImportada(
        conta.id, externo, date(2026, 11, dia), descricao, Dinheiro(centavos), sentido
    )
    with uow as u:
        u.transacoes_importadas.adicionar_se_nova(t)
        u.commit()
    return t


def _posicao(uow, nome="AUPO11", tipo="EQUITY", externo="aupo11"):
    with uow as u:
        u.investimentos.salvar_posicao(
            PESSOA, InvestimentoExterno(externo, nome, tipo, None, Dinheiro(1), "{}")
        )
        u.commit()
    with uow as u:
        return next(p for p in u.investimentos.listar_posicoes(PESSOA) if p.nome == nome)


def _operacao(uow, posicao, centavos, tipo=TipoDeOperacao.COMPRA, **mudancas):
    base = dict(
        posicao_id=posicao.id,
        tipo=tipo,
        data=date(2026, 11, 3),
        quantidade=Decimal("1"),
        valor_bruto=Dinheiro(centavos),
        origem=OrigemDaOperacao.PLUGGY,
        id_externo=f"op{uuid4()}",
    )
    base.update(mudancas)
    o = Operacao(**base)
    with uow as u:
        u.operacoes.adicionar(PESSOA, o)
        u.commit()
    return o


def _revisao(uow):
    return ListarRevisaoDaBolsa(uow).executar(PESSOA)


def _confirmar(uow, *propostas):
    itens = [ItemDeConfirmacao(p.proposta.chave, p.versao) for p in propostas]
    return ConfirmarPropostasDaBolsa(uow).executar(PESSOA, itens)


def _estado(uow):
    e = uow.confirmado
    return (
        {k: v.saldo for k, v in e.contas.items()},
        dict(e.destinacoes) if hasattr(e, "destinacoes") else None,
    )


# --- parte 1: transações pendentes ----------------------------------------------------------


def test_proposta_de_pendentes_cria_o_casamento_e_um_aporte_por_operacao(unidade_de_trabalho):
    uow = unidade_de_trabalho
    conta = _conta(uow)
    posicao = _posicao(uow)
    a, b = _operacao(uow, posicao, 100000), _operacao(uow, posicao, 178930)
    bruto = _transacao(uow, conta, BRUTO, 278930, "b")
    taxas = [_transacao(uow, conta, TAXA, c, f"t{c}") for c in (10, 20, 5)]
    saldos_antes = {k: v.saldo for k, v in uow.confirmado.contas.items()}
    (proposta,) = _revisao(uow).propostas
    confirmados = _confirmar(uow, proposta)
    assert len(confirmados) == 1
    e = uow.confirmado
    (casamento,) = e.casamentos.values()
    assert set(casamento.operacao_ids) == {a.id, b.id}
    movimentos = list(e.movimentos_de_investimento.values())
    assert len(movimentos) == 2  # um por operação; taxas não geram movimento
    assert {m.tipo for m in movimentos} == {TipoDeMovimento.APORTE}
    assert {m.investimento_id for m in movimentos} == {posicao.id}
    assert {m.valor.centavos for m in movimentos} == {100000, 178930}
    assert sum(m.valor.centavos for m in movimentos) == bruto.valor.centavos
    assert all(m.transacao_importada_id == bruto.id for m in movimentos)
    assert not e.destinacoes_dos_movimentos if hasattr(e, "destinacoes_dos_movimentos") else True
    for t in (bruto, *taxas):
        assert e.transacoes_importadas[t.id].estado == EstadoDaTransacaoImportada.ACEITA
    assert {k: v.saldo for k, v in e.contas.items()} == saldos_antes


def test_venda_gera_resgate_com_o_bruto_da_operacao(unidade_de_trabalho):
    uow = unidade_de_trabalho
    conta = _conta(uow)
    posicao = _posicao(uow)
    _operacao(uow, posicao, 5000, tipo=TipoDeOperacao.VENDA)
    _transacao(uow, conta, BRUTO, 5000, "b", sentido=SentidoDaTransacao.ENTRADA)
    (proposta,) = _revisao(uow).propostas
    _confirmar(uow, proposta)
    (movimento,) = uow.confirmado.movimentos_de_investimento.values()
    assert movimento.tipo == TipoDeMovimento.RESGATE
    assert movimento.valor.centavos == 5000


# --- parte 2: lançamentos já aceitos, escolha, versão e tudo-ou-nada ------------------------


def test_a_partir_de_aporte_e_taxa_ja_aceitos_o_resultado_e_o_mesmo(unidade_de_trabalho):
    uow = unidade_de_trabalho
    conta = _conta(uow)
    posicao = _posicao(uow)
    _operacao(uow, posicao, 278930)
    bruto = _transacao(uow, conta, BRUTO, 278930, "b")
    taxa = _transacao(uow, conta, TAXA, 62, "t")
    AceitarTransacaoImportada(uow).executar(PESSOA, bruto.id, None, [], como_investimento=True)
    # Dado histórico: a taxa foi aceita como aporte sem investimento antes da regra atual.
    with uow as u:
        taxa.aceitar()
        u.transacoes_importadas.atualizar_estado(taxa)
        u.movimentos_de_investimento.adicionar(
            MovimentoDeInvestimento(
                conta.id,
                TipoDeMovimento.APORTE,
                taxa.valor,
                taxa.descricao,
                taxa.data,
                transacao_importada_id=taxa.id,
            )
        )
        u.commit()
    antigos = set(uow.confirmado.movimentos_de_investimento)
    assert len(antigos) == 2
    (proposta,) = _revisao(uow).propostas
    efeitos = {e.codigo for e in proposta.proposta.efeitos}
    assert efeitos == {"aporte_passa_a_ser_da_posicao", "taxa_deixa_de_ser_aporte"}
    _confirmar(uow, proposta)
    e = uow.confirmado
    (movimento,) = e.movimentos_de_investimento.values()
    assert movimento.id not in antigos
    assert movimento.investimento_id == posicao.id and movimento.valor.centavos == 278930
    assert len(e.reversoes_de_classificacao) == 2  # a trilha de auditoria guarda a saída antiga
    assert e.contas[conta.id].saldo == Dinheiro(50000)


def test_resgate_de_renda_fixa_a_partir_de_resgate_e_ganho(unidade_de_trabalho):
    uow = unidade_de_trabalho
    conta = _conta(uow)
    cdb = _posicao(uow, "CDB", "FIXED_INCOME", "cdb")
    _operacao(uow, cdb, 12000, tipo=TipoDeOperacao.VENCIMENTO, custos=Dinheiro(300))
    principal = _transacao(
        uow, conta, "RESGATE CDB", 10000, "p", sentido=SentidoDaTransacao.ENTRADA, dia=3
    )
    rendimento = _transacao(
        uow, conta, "JUROS RECEBIDOS CDB", 2000, "r", sentido=SentidoDaTransacao.ENTRADA, dia=3
    )
    imposto = _transacao(uow, conta, "IRRF CDB", 300, "i", dia=3)
    AceitarTransacaoImportada(uow).executar(PESSOA, principal.id, None, [], como_investimento=True)
    AceitarTransacaoImportada(uow).executar(PESSOA, rendimento.id, None, ["renda"])
    assert uow.confirmado.ganhos
    (proposta,) = _revisao(uow).propostas
    assert proposta.proposta.tipo == "resgate_de_renda_fixa"
    _confirmar(uow, proposta)
    e = uow.confirmado
    assert not e.ganhos  # o ganho saiu da renda
    (movimento,) = e.movimentos_de_investimento.values()
    assert movimento.tipo == TipoDeMovimento.RESGATE and movimento.valor.centavos == 12000
    assert e.transacoes_importadas[imposto.id].estado == EstadoDaTransacaoImportada.ACEITA


def test_lote_com_a_segunda_invalida_nao_grava_nenhuma(unidade_de_trabalho):
    uow = unidade_de_trabalho
    conta = _conta(uow)
    posicao = _posicao(uow)
    _operacao(uow, posicao, 1000)
    _transacao(uow, conta, BRUTO, 1000, "b")
    (proposta,) = _revisao(uow).propostas
    itens = [
        ItemDeConfirmacao(proposta.proposta.chave, proposta.versao),
        ItemDeConfirmacao("chave-que-nao-existe", "x"),
    ]
    with pytest.raises(RevisaoDesatualizada):
        ConfirmarPropostasDaBolsa(uow).executar(PESSOA, itens)
    assert not uow.confirmado.casamentos and not uow.confirmado.movimentos_de_investimento


def test_versao_diferente_da_lida_e_recusada(unidade_de_trabalho):
    uow = unidade_de_trabalho
    conta = _conta(uow)
    posicao = _posicao(uow)
    _operacao(uow, posicao, 1000)
    bruto = _transacao(uow, conta, BRUTO, 1000, "b")
    (proposta,) = _revisao(uow).propostas
    AceitarTransacaoImportada(uow).executar(PESSOA, bruto.id, None, [], como_investimento=True)
    with pytest.raises(RevisaoDesatualizada):
        _confirmar(uow, proposta)
    assert not uow.confirmado.casamentos


def test_precisa_escolher_exige_a_escolha_explicita_e_valida(unidade_de_trabalho):
    uow = unidade_de_trabalho
    conta = _conta(uow)
    posicao = _posicao(uow)
    a, b = _operacao(uow, posicao, 1000), _operacao(uow, posicao, 1000)
    _transacao(uow, conta, BRUTO, 1000, "b")
    (proposta,) = _revisao(uow).propostas
    assert proposta.proposta.confianca == "precisa_escolher"
    with pytest.raises(CasamentoAmbiguo):
        _confirmar(uow, proposta)
    chave, versao = proposta.proposta.chave, proposta.versao
    ConfirmarPropostasDaBolsa(uow).executar(
        PESSOA, [ItemDeConfirmacao(chave, versao, operacao_ids=(a.id,))]
    )
    (movimento,) = uow.confirmado.movimentos_de_investimento.values()
    assert movimento.valor.centavos == 1000
    assert b.id not in {o for c in uow.confirmado.casamentos.values() for o in c.operacao_ids}
