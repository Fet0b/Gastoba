"""Migration da coluna `destinacoes_cadastradas.icone`. Só dados fictícios, em SQLite temporário."""

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

from gastoba.infrastructure.configuracoes import obter_configuracoes

ANTES = "f72000000001"
DEPOIS = "f77000000001"


@pytest.fixture
def url_banco(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/icone.db"
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


def test_ha_uma_unica_cabeca_e_e_a_nova(config):
    assert ScriptDirectory.from_config(config).get_heads() == [DEPOIS]


def test_sobe_com_coluna_nula_e_dados_intactos_e_desce_sem_perder_o_cadastro(url_banco, config):
    command.upgrade(config, ANTES)
    engine = create_engine(url_banco)
    assert "icone" not in {
        c["name"] for c in inspect(engine).get_columns("destinacoes_cadastradas")
    }
    with engine.begin() as conexao:
        conexao.execute(
            text(
                "INSERT INTO usuarios (id, nome) VALUES ('11111111111111111111111111111111', 'Ana')"
            )
        )
        conexao.execute(
            text(
                "INSERT INTO destinacoes_cadastradas (id, usuario_id, nome) VALUES "
                "('22222222222222222222222222222222', '11111111111111111111111111111111', 'viagem')"
            )
        )

    command.upgrade(config, DEPOIS)

    colunas = {c["name"]: c for c in inspect(engine).get_columns("destinacoes_cadastradas")}
    assert colunas["icone"]["nullable"] is True
    with engine.connect() as conexao:
        assert conexao.execute(text("SELECT nome, icone FROM destinacoes_cadastradas")).all() == [
            ("viagem", None)
        ]

    command.downgrade(config, ANTES)

    assert "icone" not in {
        c["name"] for c in inspect(engine).get_columns("destinacoes_cadastradas")
    }
    with engine.connect() as conexao:
        assert conexao.execute(text("SELECT nome FROM destinacoes_cadastradas")).all() == [
            ("viagem",)
        ]
