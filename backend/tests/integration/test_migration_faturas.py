"""Migration f1a8c4d92e37 (faturas do cartão). Só dados fictícios, em SQLite temporário."""

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from gastoba.infrastructure.configuracoes import obter_configuracoes

ANTES = "a7c3e5f19d24"
USUARIO = "00000000000000000000000000000001"
CONTA = "0000000000000000000000000000000a"
TRANSACAO = "000000000000000000000000000000b1"


@pytest.fixture
def url_banco(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/faturas.db"
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


def _executar(engine, *comandos):
    with engine.begin() as conexao:
        for comando in comandos:
            conexao.execute(text(comando))


def _semear(engine):
    _executar(
        engine,
        f"INSERT INTO usuarios (id, nome) VALUES ('{USUARIO}', 'Ana')",
        "INSERT INTO contas (id, usuario_id, nome, saldo_centavos, origem, tipo, id_externo) "
        f"VALUES ('{CONTA}', '{USUARIO}', 'Cartão', -1000, 'open_finance', 'cartao', 'x1')",
        "INSERT INTO transacoes_importadas (id, conta_id, id_externo, data, descricao, "
        "valor_centavos, sentido, estado) "
        f"VALUES ('{TRANSACAO}', '{CONTA}', 't1', '2026-10-10', 'Mercado', 500, 'saida', "
        "'pendente')",
    )


def test_ha_uma_cabeca(config):
    assert len(ScriptDirectory.from_config(config).get_heads()) == 1


def test_sobe_e_desce_sem_tocar_nos_dados_antigos(url_banco, config):
    engine = create_engine(url_banco)
    try:
        command.upgrade(config, ANTES)
        _semear(engine)

        command.upgrade(config, "head")
        inspetor = inspect(engine)
        assert {"faturas", "pagamentos_de_fatura"} <= set(inspetor.get_table_names())
        colunas = {c["name"] for c in inspetor.get_columns("transacoes_importadas")}
        assert {"fatura_id", "id_externo_da_fatura", "parcela_numero", "parcela_total"} <= colunas
        with engine.connect() as c:
            assert c.execute(
                text("SELECT valor_centavos, fatura_id, parcela_numero FROM transacoes_importadas")
            ).all() == [(500, None, None)]

        command.downgrade(config, ANTES)
        inspetor = inspect(engine)
        assert "faturas" not in inspetor.get_table_names()
        assert "pagamentos_de_fatura" not in inspetor.get_table_names()
        colunas = {c["name"] for c in inspetor.get_columns("transacoes_importadas")}
        assert "fatura_id" not in colunas and "parcela_total" not in colunas
        with engine.connect() as c:
            assert c.execute(text("SELECT valor_centavos FROM transacoes_importadas")).all() == [
                (500,)
            ]
    finally:
        engine.dispose()


@pytest.mark.parametrize(("numero", "total"), [(0, 3), (4, 3), (2, "NULL"), ("NULL", 3)])
def test_check_rejeita_parcela_invalida(url_banco, config, numero, total):
    engine = create_engine(url_banco)
    try:
        command.upgrade(config, "head")
        _semear(engine)
        with pytest.raises(IntegrityError):
            _executar(
                engine,
                f"UPDATE transacoes_importadas SET parcela_numero = {numero}, "
                f"parcela_total = {total} WHERE id = '{TRANSACAO}'",
            )
    finally:
        engine.dispose()


def test_check_aceita_parcela_valida(url_banco, config):
    engine = create_engine(url_banco)
    try:
        command.upgrade(config, "head")
        _semear(engine)
        _executar(
            engine,
            "UPDATE transacoes_importadas SET parcela_numero = 2, parcela_total = 10 "
            f"WHERE id = '{TRANSACAO}'",
        )
    finally:
        engine.dispose()
