"""Migration b3e9d1a74c58 (caixinhas no orçamento). Só dados fictícios, em SQLite temporário."""

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

from gastoba.infrastructure.configuracoes import obter_configuracoes

ANTES = "f1a8c4d92e37"
DEPOIS = "b3e9d1a74c58"


@pytest.fixture
def url_banco(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/caixinhas.db"
    monkeypatch.setenv("GASTOBA_URL_BANCO", url)
    obter_configuracoes.cache_clear()
    yield url
    obter_configuracoes.cache_clear()


@pytest.fixture
def config():
    config = Config()
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[2] / "migrations")
    )
    return config


def test_ha_uma_unica_cabeca(config):
    assert len(ScriptDirectory.from_config(config).get_heads()) == 1


def test_sobe_e_desce_sem_perder_gastos_e_resgates(url_banco, config):
    command.upgrade(config, ANTES)
    engine = create_engine(url_banco)
    assert "vinculos_das_destinacoes" not in inspect(engine).get_table_names()

    command.upgrade(config, DEPOIS)
    inspetor = inspect(engine)
    assert "vinculos_das_destinacoes" in inspetor.get_table_names()
    assert "categoria" in {c["name"] for c in inspetor.get_columns("destinacoes")}
    colunas = {c["name"] for c in inspetor.get_columns("coberturas_de_compra")}
    assert {"movimento_id", "principal_centavos"} <= colunas

    command.downgrade(config, ANTES)
    inspetor = inspect(create_engine(url_banco))
    assert "vinculos_das_destinacoes" not in inspetor.get_table_names()
    assert "categoria" not in {c["name"] for c in inspetor.get_columns("destinacoes")}
    with create_engine(url_banco).connect() as conexao:
        assert conexao.execute(text("SELECT count(*) FROM gastos")).scalar() == 0
