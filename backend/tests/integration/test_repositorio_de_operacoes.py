from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

from gastoba.domain.casamento_de_operacao import (
    CasamentoDeOperacao,
    PapelDoVinculo,
    VinculoDeCasamento,
)
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.configuracoes import obter_configuracoes
from gastoba.infrastructure.persistencia.banco import criar_engine, criar_fabrica_de_sessoes
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


@pytest.fixture
def banco(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/operacoes.db"
    monkeypatch.setenv("GASTOBA_URL_BANCO", url)
    obter_configuracoes.cache_clear()
    config = Config()
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[2] / "migrations")
    )
    command.upgrade(config, "head")
    engine = criar_engine(url)
    uow = UnidadeDeTrabalhoSqlAlchemy(criar_fabrica_de_sessoes(engine))
    pessoa, outra = Usuario("Pessoa fictícia"), Usuario("Outra fictícia")
    with uow as u:
        for p in (pessoa, outra):
            u.usuarios.garantir(p)
        u.investimentos.salvar_posicao(
            pessoa.id, InvestimentoExterno("a", "AUPO11", "ETF", None, Dinheiro(369237), "{}")
        )
        u.commit()
    with uow as u:
        (investimento,) = u.investimentos.listar_posicoes(pessoa.id)
    yield uow, pessoa, outra, investimento.id
    engine.dispose()


def _compra(posicao, externo="pl-1"):
    return Operacao(
        posicao_id=posicao,
        tipo=TipoDeOperacao.COMPRA,
        data=date(2026, 11, 3),
        quantidade=Decimal("25"),
        valor_bruto=Dinheiro(278930),
        origem=OrigemDaOperacao.PLUGGY,
        id_externo=externo,
    )


def test_adicionar_e_idempotente_por_id_externo(banco):
    uow, pessoa, _, posicao = banco
    with uow as u:
        assert u.operacoes.adicionar(pessoa.id, _compra(posicao))
        assert not u.operacoes.adicionar(pessoa.id, _compra(posicao))
        u.commit()
    with uow as u:
        (operacao,) = u.operacoes.listar_da_posicao(pessoa.id, posicao)
    assert operacao.quantidade == Decimal("25")
    assert operacao.valor_bruto == Dinheiro(278930)


def test_outra_pessoa_nao_ve_nem_altera(banco):
    uow, pessoa, outra, posicao = banco
    operacao = _compra(posicao)
    with uow as u:
        u.operacoes.adicionar(pessoa.id, operacao)
        u.commit()
    with uow as u:
        assert u.operacoes.listar_da_posicao(outra.id, posicao) == []
        assert u.operacoes.obter(outra.id, operacao.id) is None
        assert not u.operacoes.adicionar(outra.id, _compra(posicao, "pl-2"))
        u.operacoes.remover(outra.id, operacao.id)
        u.commit()
    with uow as u:
        assert u.operacoes.obter(pessoa.id, operacao.id) is not None


def test_atualizar_e_remover_operacao_manual(banco):
    uow, pessoa, _, posicao = banco
    manual = Operacao(
        posicao_id=posicao,
        tipo=TipoDeOperacao.ABERTURA,
        data=date(2026, 11, 1),
        quantidade=Decimal("10"),
        valor_bruto=Dinheiro(1000),
        origem=OrigemDaOperacao.ABERTURA,
    )
    with uow as u:
        u.operacoes.adicionar(pessoa.id, manual)
        u.commit()
    editada = Operacao(
        posicao_id=posicao,
        tipo=TipoDeOperacao.ABERTURA,
        data=date(2026, 11, 2),
        quantidade=Decimal("12.5"),
        valor_bruto=Dinheiro(2000),
        origem=OrigemDaOperacao.ABERTURA,
        id=manual.id,
    )
    with uow as u:
        u.operacoes.atualizar(pessoa.id, editada)
        u.commit()
    with uow as u:
        assert u.operacoes.obter(pessoa.id, manual.id).quantidade == Decimal("12.5")
        u.operacoes.remover(pessoa.id, manual.id)
        u.commit()
    with uow as u:
        assert u.operacoes.obter(pessoa.id, manual.id) is None


def test_casamento_guarda_varias_operacoes_vinculos_e_desfaz_sem_apagar_as_operacoes(banco):
    from gastoba.domain.conta import Conta, OrigemDaConta
    from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

    uow, pessoa, outra, posicao = banco
    a, b = _compra(posicao, "pl-1"), _compra(posicao, "pl-2")
    conta = Conta(
        usuario_id=pessoa.id,
        nome="Banco",
        saldo=Dinheiro(0),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo="ext-1",
    )
    bruto, taxa, solta = (
        TransacaoImportada(
            conta.id, f"t{n}", date(2026, 11, 5), "LIQ", Dinheiro(100), SentidoDaTransacao.SAIDA
        )
        for n in range(3)
    )
    casamento = CasamentoDeOperacao(
        (a.id, b.id),
        (
            VinculoDeCasamento(bruto.id, PapelDoVinculo.BRUTO),
            VinculoDeCasamento(taxa.id, PapelDoVinculo.TAXA),
        ),
    )
    with uow as u:
        u.contas.adicionar(conta)
        for t in (bruto, taxa, solta):
            u.transacoes_importadas.adicionar_se_nova(t)
        u.operacoes.adicionar(pessoa.id, a)
        u.operacoes.adicionar(pessoa.id, b)
        u.casamentos.adicionar(pessoa.id, casamento)
        u.commit()
    with uow as u:
        assert u.casamentos.para_operacao(pessoa.id, a.id).id == casamento.id
        lido = u.casamentos.para_operacao(pessoa.id, b.id)
        assert set(lido.operacao_ids) == {a.id, b.id}
        assert {v.papel for v in lido.vinculos} == {PapelDoVinculo.BRUTO, PapelDoVinculo.TAXA}
        assert [c.id for c in u.casamentos.listar(pessoa.id)] == [casamento.id]
        assert u.casamentos.transacoes_casadas(pessoa.id) == {bruto.id, taxa.id}
        # Isolamento (Art. IV.5): outra pessoa não vê nada.
        assert u.casamentos.listar(outra.id) == []
        assert u.casamentos.transacoes_casadas(outra.id) == set()
        assert u.casamentos.para_operacao(outra.id, a.id) is None
        assert u.casamentos.obter(outra.id, casamento.id) is None
        u.casamentos.remover(pessoa.id, casamento.id)
        u.commit()
    with uow as u:
        assert u.casamentos.listar(pessoa.id) == []
        assert u.operacoes.obter(pessoa.id, a.id) is not None
        assert u.operacoes.obter(pessoa.id, b.id) is not None
