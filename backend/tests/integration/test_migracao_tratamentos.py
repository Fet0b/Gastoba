from datetime import UTC, date, datetime
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

from gastoba.domain.conta import Conta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.tratamento_de_aporte import AcaoDoTratamento, TratamentoDeAporte
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.configuracoes import obter_configuracoes
from gastoba.infrastructure.persistencia.banco import criar_engine, criar_fabrica_de_sessoes
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy

ANTERIOR, NOVA = "b60000000001", "b60000000002"
AGORA = datetime(2026, 11, 10, 15, tzinfo=UTC)
DIA = date(2026, 10, 27)


def _config():
    config = Config()
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[2] / "migrations")
    )
    return config


@pytest.fixture
def banco(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/tratamentos.db"
    monkeypatch.setenv("GASTOBA_URL_BANCO", url)
    obter_configuracoes.cache_clear()
    command.upgrade(_config(), ANTERIOR)
    yield url
    obter_configuracoes.cache_clear()


def test_upgrade_cria_so_a_tabela_nova_e_downgrade_so_ela(banco):
    antes = set(inspect(criar_engine(banco)).get_table_names())
    assert "tratamentos_de_aporte" not in antes
    command.upgrade(_config(), NOVA)
    depois = set(inspect(criar_engine(banco)).get_table_names())
    assert depois - antes == {"tratamentos_de_aporte"}
    command.downgrade(_config(), ANTERIOR)
    assert set(inspect(criar_engine(banco)).get_table_names()) == antes


def _semear(uow):
    pessoa = Usuario("Pessoa fictícia")
    conta = Conta(pessoa.id, "Banco", Dinheiro(0))
    movimentos = [
        MovimentoDeInvestimento(conta.id, TipoDeMovimento.APORTE, Dinheiro(14313), "A", DIA)
        for _ in range(2)
    ]
    with uow as u:
        u.usuarios.garantir(pessoa)
        u.contas.adicionar(conta)
        for m in movimentos:
            u.movimentos_de_investimento.adicionar(m)
        u.commit()
    return pessoa, movimentos


def test_total_so_muda_depois_da_aprovacao_e_volta_ao_desfazer(banco):
    command.upgrade(_config(), "head")
    engine = criar_engine(banco)
    uow = UnidadeDeTrabalhoSqlAlchemy(criar_fabrica_de_sessoes(engine))
    pessoa, (a, b) = _semear(uow)
    tratamento = TratamentoDeAporte(
        a.id, AcaoDoTratamento.MESCLADO, {"valor_centavos": 14313}, AGORA, mesclado_em_id=b.id
    )
    with uow as u:
        u.tratamentos.adicionar(pessoa.id, tratamento)
        u.commit()
    with uow as u:
        assert u.movimentos_de_investimento.somar_aportes(pessoa.id, DIA, DIA) == Dinheiro(28626)
    tratamento.aprovado_em = AGORA
    with uow as u:
        u.tratamentos.atualizar(pessoa.id, tratamento)
        u.commit()
    with uow as u:
        assert u.movimentos_de_investimento.somar_aportes(pessoa.id, DIA, DIA) == Dinheiro(14313)
        assert [m.id for m in u.movimentos_de_investimento.listar(pessoa.id, DIA, DIA)] == [b.id]
        # O registro continua guardado, com o valor original.
        guardado = u.tratamentos.obter(pessoa.id, tratamento.id)
        assert guardado.valores_originais == {"valor_centavos": 14313}
    tratamento.desfeito_em = AGORA
    with uow as u:
        u.tratamentos.atualizar(pessoa.id, tratamento)
        u.commit()
    with uow as u:
        assert u.movimentos_de_investimento.somar_aportes(pessoa.id, DIA, DIA) == Dinheiro(28626)
    engine.dispose()


def test_um_so_tratamento_ativo_por_aporte_e_mescla_coerente(banco):
    command.upgrade(_config(), "head")
    engine = criar_engine(banco)
    uow = UnidadeDeTrabalhoSqlAlchemy(criar_fabrica_de_sessoes(engine))
    pessoa, (a, b) = _semear(uow)
    with uow as u:
        u.tratamentos.adicionar(
            pessoa.id, TratamentoDeAporte(a.id, AcaoDoTratamento.EXCLUIDO, {}, AGORA)
        )
        u.commit()
    with pytest.raises(IntegrityError), uow as u:
        u.tratamentos.adicionar(
            pessoa.id, TratamentoDeAporte(a.id, AcaoDoTratamento.EXCLUIDO, {}, AGORA)
        )
        u.commit()
    engine.dispose()
