from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from gastoba.infrastructure.configuracoes import obter_configuracoes
from gastoba.infrastructure.persistencia.banco import criar_engine

ANTERIOR = "b60000000002"
NOVA = "c61000000001"


def _config():
    config = Config()
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[2] / "migrations")
    )
    return config


@pytest.fixture
def banco(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/casamentos.db"
    monkeypatch.setenv("GASTOBA_URL_BANCO", url)
    obter_configuracoes.cache_clear()
    command.upgrade(_config(), ANTERIOR)
    engine = criar_engine(url)
    yield url, engine
    engine.dispose()


def _operacoes(conexao, quantas):
    usuario, investimento = uuid4().hex, uuid4().hex
    conexao.execute(
        text("INSERT INTO usuarios (id, nome) VALUES (:id, 'Pessoa fictícia')"), {"id": usuario}
    )
    conexao.execute(
        text(
            "INSERT INTO investimentos (id, usuario_id, id_externo, nome, tipo, saldo_centavos, "
            "dados) VALUES (:id, :u, 'x', 'Ativo', 'EQUITY', 100, '{}')"
        ),
        {"id": investimento, "u": usuario},
    )
    conexao.execute(
        text("INSERT INTO posicoes_de_investimento (investimento_id) VALUES (:i)"),
        {"i": investimento},
    )
    ids = []
    for n in range(quantas):
        id_ = uuid4().hex
        conexao.execute(
            text(
                "INSERT INTO operacoes_de_investimento (id, posicao_id, tipo, data, quantidade, "
                "valor_bruto_centavos, custos_centavos, origem, id_externo) VALUES (:id, :p, "
                "'COMPRA', '2026-11-03', '1', 1000, 0, 'pluggy', :e)"
            ),
            {"id": id_, "p": investimento, "e": f"pl-{n}"},
        )
        ids.append(id_)
    return ids


def _casamento(conexao, operacao_id):
    id_ = uuid4().hex
    conexao.execute(
        text(
            "INSERT INTO casamentos_de_operacao (id, operacao_id, estado) "
            "VALUES (:id, :o, 'confirmado')"
        ),
        {"id": id_, "o": operacao_id},
    )
    return id_


def test_subir_cria_a_tabela_e_copia_o_par_de_cada_casamento(banco):
    url, engine = banco
    with engine.begin() as c:
        a, b = _operacoes(c, 2)
        ca, cb = _casamento(c, a), _casamento(c, b)
    command.upgrade(_config(), NOVA)
    with criar_engine(url).connect() as c:
        pares = set(
            c.execute(text("SELECT casamento_id, operacao_id FROM operacoes_do_casamento")).all()
        )
        assert pares == {(ca, a), (cb, b)}
        colunas = {col["name"] for col in inspect(c).get_columns("casamentos_de_operacao")}
        assert "operacao_id" not in colunas


def test_uma_operacao_so_pode_estar_em_um_casamento(banco):
    url, engine = banco
    with engine.begin() as c:
        (a,) = _operacoes(c, 1)
        casamento = _casamento(c, a)
    command.upgrade(_config(), NOVA)
    with pytest.raises(IntegrityError), criar_engine(url).begin() as c:
        outro = uuid4().hex
        c.execute(
            text("INSERT INTO casamentos_de_operacao (id, estado) VALUES (:i, 'confirmado')"),
            {"i": outro},
        )
        c.execute(
            text("INSERT INTO operacoes_do_casamento (casamento_id, operacao_id) VALUES (:c, :o)"),
            {"c": outro, "o": a},
        )
    assert casamento


def test_descer_recria_a_coluna_com_a_operacao_de_menor_id(banco):
    url, engine = banco
    with engine.begin() as c:
        a, b = _operacoes(c, 2)
        _casamento(c, a)
        _casamento(c, b)
    command.upgrade(_config(), NOVA)
    command.downgrade(_config(), ANTERIOR)
    with criar_engine(url).connect() as c:
        assert {
            r[0] for r in c.execute(text("SELECT operacao_id FROM casamentos_de_operacao"))
        } == {
            a,
            b,
        }
        assert "operacoes_do_casamento" not in inspect(c).get_table_names()


def test_descer_com_casamento_de_duas_operacoes_falha_sem_alterar_nada(banco):
    url, engine = banco
    with engine.begin() as c:
        a, b = _operacoes(c, 2)
        casamento = _casamento(c, a)
    command.upgrade(_config(), NOVA)
    with engine.begin() as c:
        c.execute(
            text("INSERT INTO operacoes_do_casamento (casamento_id, operacao_id) VALUES (:c, :o)"),
            {"c": casamento, "o": b},
        )
    with pytest.raises(Exception, match="mais de uma operação"):
        command.downgrade(_config(), ANTERIOR)
    with criar_engine(url).connect() as c:
        assert "operacoes_do_casamento" in inspect(c).get_table_names()
        assert c.execute(text("SELECT count(*) FROM operacoes_do_casamento")).scalar() == 2
        colunas = {col["name"] for col in inspect(c).get_columns("casamentos_de_operacao")}
        assert "operacao_id" not in colunas


def test_ha_uma_so_cabeca():
    assert len(ScriptDirectory.from_config(_config()).get_heads()) == 1
