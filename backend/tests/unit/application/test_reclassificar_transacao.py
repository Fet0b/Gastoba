from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.consultar_impacto_da_reversao import ConsultarImpactoDaReversao
from gastoba.application.desfazer_classificacao_importada import DesfazerClassificacaoImportada
from gastoba.application.reclassificar_transacao_importada import (
    ReclassificarTransacaoImportada,
)
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    MovimentoNaoDesfazivel,
    TransacaoImportadaInvalida,
    TransacaoImportadaNaoEncontrada,
)
from gastoba.domain.movimento_de_investimento import TipoDeMovimento
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)

USUARIO, OUTRO = uuid4(), uuid4()
DIA = date(2026, 10, 26)


def _cenario(uow, descricao, centavos, sentido):
    conta = Conta(USUARIO, "Banco", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE, id_externo="c")
    transacao = TransacaoImportada(conta.id, "t1", DIA, descricao, Dinheiro(centavos), sentido)
    with uow as u:
        u.contas.adicionar(conta)
        u.transacoes_importadas.adicionar_se_nova(transacao)
        u.investimentos.salvar_posicao(
            USUARIO, InvestimentoExterno("cdb", "CDB", "FIXED_INCOME", "CDB", Dinheiro(5000), "{}")
        )
        u.commit()
    with uow as u:
        investimento = u.investimentos.listar_posicoes(USUARIO)[0]
    return transacao, investimento


def _aporte_legado(uow, transacao):
    """O estado que existe em produção: o IRRF aceito como aporte, sem investimento."""
    from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento

    with uow as u:
        t = u.transacoes_importadas.obter(USUARIO, transacao.id)
        u.movimentos_de_investimento.adicionar(
            MovimentoDeInvestimento(
                t.conta_id,
                TipoDeMovimento.APORTE,
                t.valor,
                t.descricao,
                t.data,
                transacao_importada_id=t.id,
            )
        )
        t.aceitar()
        u.transacoes_importadas.atualizar_estado(t)
        u.commit()


def _resgate_do_titulo(uow, cdb):
    """O resgate (a entrada de R$ 120,00) a que o IRRF pertence."""
    from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento

    with uow as u:
        conta = u.contas.listar(USUARIO)[0]
        resgate = MovimentoDeInvestimento(
            conta.id, TipoDeMovimento.RESGATE, Dinheiro(12000), "Resgate", DIA, cdb.id
        )
        u.movimentos_de_investimento.adicionar(resgate)
        u.commit()
    return resgate


def _versao(uow, transacao):
    return ConsultarImpactoDaReversao(uow).executar(USUARIO, transacao.id).versao


def _reclassificar(uow, transacao, rotulo, **opcoes):
    return ReclassificarTransacaoImportada(uow).executar(
        USUARIO, transacao.id, rotulo, versao_esperada=_versao(uow, transacao), **opcoes
    )


def _lancamentos(uow, transacao):
    with uow as u:
        return (
            u.gastos.da_transacao(USUARIO, transacao.id),
            u.ganhos.da_transacao(USUARIO, transacao.id),
            u.movimentos_de_investimento.da_transacao(USUARIO, transacao.id),
        )


def test_gasto_vira_transferencia_para_investimento(unidade_de_trabalho):
    transacao, cdb = _cenario(unidade_de_trabalho, "Aplicação", 10000, SentidoDaTransacao.SAIDA)
    AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO, transacao.id, CategoriaDoGasto.LAZER, []
    )
    _reclassificar(unidade_de_trabalho, transacao, "transferencia_para_investimento")
    gastos, _, movimentos = _lancamentos(unidade_de_trabalho, transacao)
    assert gastos == []
    (aporte,) = movimentos
    assert aporte.tipo == TipoDeMovimento.APORTE
    assert aporte.categoria is None  # aporte nunca é despesa (054)
    with unidade_de_trabalho as u:
        assert u.contas.listar(USUARIO)[0].saldo == Dinheiro(0)  # o saldo é do banco


def test_irrf_de_aporte_vira_imposto_da_posicao(unidade_de_trabalho):
    transacao, cdb = _cenario(
        unidade_de_trabalho, "IRRF - CDB BANCO GUANABARA", 490, SentidoDaTransacao.SAIDA
    )
    _aporte_legado(unidade_de_trabalho, transacao)
    resgate = _resgate_do_titulo(unidade_de_trabalho, cdb)
    _reclassificar(
        unidade_de_trabalho,
        transacao,
        "imposto",
        investimento_id=cdb.id,
        movimento_relacionado_id=resgate.id,
    )
    _, _, (imposto,) = _lancamentos(unidade_de_trabalho, transacao)
    assert imposto.tipo == TipoDeMovimento.IMPOSTO
    assert imposto.investimento_id == cdb.id
    with unidade_de_trabalho as u:
        assert u.movimentos_de_investimento.somar_aportes(USUARIO, DIA, DIA) == Dinheiro(0)


def test_rendimento_aceito_como_ganho_sai_da_renda_e_vira_rendimento_da_posicao(
    unidade_de_trabalho,
):
    transacao, cdb = _cenario(unidade_de_trabalho, "Credito CDB", 2803, SentidoDaTransacao.ENTRADA)
    AceitarTransacaoImportada(unidade_de_trabalho).executar(USUARIO, transacao.id, None, [])
    assert len(_lancamentos(unidade_de_trabalho, transacao)[1]) == 1  # ganho = renda do mês
    _reclassificar(unidade_de_trabalho, transacao, "rendimento_da_posicao", investimento_id=cdb.id)
    _, ganhos, (rendimento,) = _lancamentos(unidade_de_trabalho, transacao)
    assert ganhos == []
    assert rendimento.tipo == TipoDeMovimento.RENDIMENTO
    assert rendimento.investimento_id == cdb.id
    with unidade_de_trabalho as u:
        assert u.ganhos.listar(USUARIO, DIA, DIA, None) == []


def test_e_desfazivel(unidade_de_trabalho):
    transacao, cdb = _cenario(unidade_de_trabalho, "Credito CDB", 2803, SentidoDaTransacao.ENTRADA)
    AceitarTransacaoImportada(unidade_de_trabalho).executar(USUARIO, transacao.id, None, [])
    _reclassificar(unidade_de_trabalho, transacao, "rendimento_da_posicao", investimento_id=cdb.id)
    DesfazerClassificacaoImportada(unidade_de_trabalho).executar(
        USUARIO, transacao.id, versao_esperada=_versao(unidade_de_trabalho, transacao)
    )
    with unidade_de_trabalho as u:
        assert (
            u.transacoes_importadas.obter(USUARIO, transacao.id).estado
            == EstadoDaTransacaoImportada.PENDENTE
        )


def test_se_a_nova_classificacao_falha_a_antiga_continua(unidade_de_trabalho):
    transacao, cdb = _cenario(unidade_de_trabalho, "IRRF - CDB", 490, SentidoDaTransacao.SAIDA)
    _aporte_legado(unidade_de_trabalho, transacao)
    antes = _lancamentos(unidade_de_trabalho, transacao)[2]
    with pytest.raises(TransacaoImportadaInvalida):
        _reclassificar(unidade_de_trabalho, transacao, "imposto")  # sem investimento
    depois = _lancamentos(unidade_de_trabalho, transacao)[2]
    assert [m.id for m in depois] == [m.id for m in antes]
    with unidade_de_trabalho as u:
        assert (
            u.transacoes_importadas.obter(USUARIO, transacao.id).estado
            == EstadoDaTransacaoImportada.ACEITA
        )


def test_versao_desatualizada_e_rotulo_invalido_sao_recusados(unidade_de_trabalho):
    transacao, cdb = _cenario(unidade_de_trabalho, "Compra", 10000, SentidoDaTransacao.SAIDA)
    AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO, transacao.id, CategoriaDoGasto.LAZER, []
    )
    with pytest.raises(MovimentoNaoDesfazivel):
        ReclassificarTransacaoImportada(unidade_de_trabalho).executar(
            USUARIO, transacao.id, "transferencia_para_investimento", versao_esperada="velha"
        )
    with pytest.raises(TransacaoImportadaInvalida):
        _reclassificar(unidade_de_trabalho, transacao, "inventado")
    assert len(_lancamentos(unidade_de_trabalho, transacao)[0]) == 1  # o gasto continua


def test_transacao_pendente_nao_se_reclassifica_e_outra_pessoa_nao_ve(unidade_de_trabalho):
    transacao, cdb = _cenario(unidade_de_trabalho, "Compra", 10000, SentidoDaTransacao.SAIDA)
    with pytest.raises(MovimentoNaoDesfazivel):
        ReclassificarTransacaoImportada(unidade_de_trabalho).executar(
            USUARIO, transacao.id, "gasto", versao_esperada="x", categoria=CategoriaDoGasto.LAZER
        )
    with pytest.raises(TransacaoImportadaNaoEncontrada):
        ReclassificarTransacaoImportada(unidade_de_trabalho).executar(
            OUTRO, transacao.id, "gasto", versao_esperada="x"
        )
