"""Migration a7c3e5f19d24 e o principal abatido nas destinações. Só dados fictícios."""

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from gastoba.infrastructure.configuracoes import obter_configuracoes

ANTES = "b6d1f4a82c35"
USUARIO = "00000000000000000000000000000001"
CONTA = "0000000000000000000000000000000a"
INVESTIMENTO = "000000000000000000000000000000c1"
MOVIMENTO = "000000000000000000000000000000d1"


@pytest.fixture
def url_banco(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/principal.db"
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
        "INSERT INTO contas (id, usuario_id, nome, saldo_centavos, origem, tipo) "
        f"VALUES ('{CONTA}', '{USUARIO}', 'Carteira', 0, 'manual', 'corrente')",
        "INSERT INTO investimentos (id, usuario_id, id_externo, nome, tipo, saldo_centavos, dados) "
        f"VALUES ('{INVESTIMENTO}', '{USUARIO}', 'i1', 'LCI', 'FIXED_INCOME', 1000, '{{}}')",
        "INSERT INTO movimentos_de_investimento (id, conta_id, investimento_id, tipo, descricao, "
        "valor_centavos, data, origem, revisao_pendente) "
        f"VALUES ('{MOVIMENTO}', '{CONTA}', '{INVESTIMENTO}', 'resgate', 'LCI', 600, "
        "'2026-10-05', 'manual', 0)",
    )


def _destinacao(engine, id_, tag, valor, principal):
    _executar(
        engine,
        "INSERT INTO destinacoes (id, movimento_id, tag, valor_centavos, principal_centavos) "
        f"VALUES ('{id_}', '{MOVIMENTO}', '{tag}', {valor}, {principal})",
    )


def test_sobe_e_desce_preservando_as_linhas(url_banco, config):
    engine = create_engine(url_banco)
    try:
        command.upgrade(config, ANTES)
        _semear(engine)
        _executar(
            engine,
            "INSERT INTO destinacoes (id, movimento_id, tag, valor_centavos) "
            f"VALUES ('f1', '{MOVIMENTO}', 'casa', -600)",
        )

        command.upgrade(config, "a7c3e5f19d24")
        colunas = {c["name"] for c in inspect(engine).get_columns("destinacoes")}
        assert "principal_centavos" in colunas
        with engine.connect() as c:
            assert c.execute(
                text("SELECT valor_centavos, principal_centavos FROM destinacoes")
            ).all() == [(-600, None)]

        command.downgrade(config, ANTES)
        colunas = {c["name"] for c in inspect(engine).get_columns("destinacoes")}
        assert "principal_centavos" not in colunas
        with engine.connect() as c:
            assert c.execute(text("SELECT valor_centavos FROM destinacoes")).all() == [(-600,)]
    finally:
        engine.dispose()


@pytest.mark.parametrize(
    ("valor", "principal"),
    [(-600, 500), (600, -500), (-600, 0), (600, 0)],
)
def test_check_rejeita_sinal_divergente_e_zero(url_banco, config, valor, principal):
    engine = create_engine(url_banco)
    try:
        command.upgrade(config, "a7c3e5f19d24")
        _semear(engine)
        with pytest.raises(IntegrityError):
            _destinacao(engine, "x", "casa", valor, principal)
    finally:
        engine.dispose()


@pytest.mark.parametrize(("valor", "principal"), [(-600, -500), (600, 500), (600, "NULL")])
def test_check_aceita_mesmo_sinal_e_nulo(url_banco, config, valor, principal):
    engine = create_engine(url_banco)
    try:
        command.upgrade(config, "a7c3e5f19d24")
        _semear(engine)
        _destinacao(engine, "x", "casa", valor, principal)
    finally:
        engine.dispose()
