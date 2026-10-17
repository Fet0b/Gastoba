from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect, text

from gastoba.infrastructure.configuracoes import obter_configuracoes
from gastoba.infrastructure.persistencia.modelos import Base

TABELAS = {
    "usuarios",
    "contas",
    "gastos",
    "ganhos",
    "sessoes",
    "chaves_de_api",
    "transacoes_importadas",
}
REVISAO_INICIAL = "ab2e8cee8c19"
# O tipo Uuid do SQLAlchemy grava no SQLite os 32 dígitos hexadecimais, sem hífens.
_USUARIO = "00000000000000000000000000000001"
_CONTA = "0000000000000000000000000000000a"
_GASTO = "0000000000000000000000000000000b"


@pytest.fixture
def url_banco(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/migracoes.db"
    # O env.py lê a URL de obter_configuracoes(), que tem lru_cache.
    monkeypatch.setenv("GASTOBA_URL_BANCO", url)
    obter_configuracoes.cache_clear()
    yield url
    obter_configuracoes.cache_clear()


@pytest.fixture
def config():
    # Sem alembic.ini: com ele, o env.py chamaria fileConfig e desligaria os loggers do pytest.
    config = Config()
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[2] / "migrations")
    )
    return config


def test_upgrade_e_downgrade_das_migrations(url_banco, config):
    engine = create_engine(url_banco)
    try:
        command.upgrade(config, "head")
        assert set(inspect(engine).get_table_names()) >= TABELAS

        with engine.connect() as conexao:
            diferencas = compare_metadata(MigrationContext.configure(conexao), Base.metadata)
        assert diferencas == []

        command.downgrade(config, "base")
        assert TABELAS.isdisjoint(inspect(engine).get_table_names())
    finally:
        engine.dispose()


def test_upgrade_preserva_usuarios_contas_e_gastos_existentes(url_banco, config):
    engine = create_engine(url_banco)
    try:
        command.upgrade(config, REVISAO_INICIAL)
        with engine.begin() as conexao:
            conexao.execute(text(f"INSERT INTO usuarios (id, nome) VALUES ('{_USUARIO}', 'Ana')"))
            conexao.execute(
                text(
                    "INSERT INTO contas (id, usuario_id, nome, saldo_centavos, origem) "
                    f"VALUES ('{_CONTA}', '{_USUARIO}', 'Carteira', 5000, 'manual')"
                )
            )
            conexao.execute(
                text(
                    "INSERT INTO gastos (id, conta_id, descricao, valor_centavos, data, tags, "
                    f"categoria, origem) VALUES ('{_GASTO}', '{_CONTA}', 'Pão', 750, "
                    "'2026-10-05', '[\"mercado\"]', 'conforto', 'manual')"
                )
            )

        command.upgrade(config, "head")

        with engine.connect() as conexao:
            usuario = conexao.execute(text("SELECT id, nome, email, senha_hash FROM usuarios"))
            conta = conexao.execute(text("SELECT nome, saldo_centavos, tipo FROM contas"))
            gasto = conexao.execute(
                text("SELECT descricao, valor_centavos, tags, categoria FROM gastos")
            )
            assert tuple(usuario.one()) == (_USUARIO, "Ana", None, None)
            assert tuple(conta.one()) == ("Carteira", 5000, "corrente")
            assert tuple(gasto.one()) == ("Pão", 750, '["mercado"]', "conforto")

        command.downgrade(config, REVISAO_INICIAL)

        assert {"sessoes", "chaves_de_api"}.isdisjoint(inspect(engine).get_table_names())
        assert {c["name"] for c in inspect(engine).get_columns("usuarios")} == {"id", "nome"}
        with engine.connect() as conexao:
            assert conexao.execute(text("SELECT nome FROM usuarios")).scalar_one() == "Ana"
            assert conexao.execute(text("SELECT count(*) FROM gastos")).scalar_one() == 1
    finally:
        engine.dispose()


def test_banco_migrado_tem_email_unico_indices_e_checks(url_banco, config):
    engine = create_engine(url_banco)
    try:
        command.upgrade(config, "head")
        inspetor = inspect(engine)

        unicos_de_usuarios = {u["name"] for u in inspetor.get_unique_constraints("usuarios")}
        checks_das_chaves = {c["name"] for c in inspetor.get_check_constraints("chaves_de_api")}
        indices_de_sessoes = {i["name"]: i["unique"] for i in inspetor.get_indexes("sessoes")}
        indices_das_chaves = {i["name"]: i["unique"] for i in inspetor.get_indexes("chaves_de_api")}

        assert "uq_usuarios_email" in unicos_de_usuarios
        assert checks_das_chaves == {
            "ck_chaves_de_api_escopo_valido",
            "ck_chaves_de_api_nome_valido",
        }
        assert indices_de_sessoes["ix_sessoes_hash_do_segredo"] == 1
        assert indices_das_chaves["ix_chaves_de_api_hash_do_segredo"] == 1
    finally:
        engine.dispose()
