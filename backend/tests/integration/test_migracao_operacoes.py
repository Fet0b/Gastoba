from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from gastoba.infrastructure.configuracoes import obter_configuracoes
from gastoba.infrastructure.persistencia.banco import criar_engine

ANTERIOR = "a05800000003"
NOVA = "b60000000001"
TABELAS = {
    "posicoes_de_investimento",
    "operacoes_de_investimento",
    "alocacoes_de_caixinha",
    "casamentos_de_operacao",
    "vinculos_de_casamento",
}


def _config():
    config = Config()
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[2] / "migrations")
    )
    return config


@pytest.fixture
def banco(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/operacoes.db"
    monkeypatch.setenv("GASTOBA_URL_BANCO", url)
    obter_configuracoes.cache_clear()
    command.upgrade(_config(), ANTERIOR)
    engine = criar_engine(url)
    yield url, engine
    engine.dispose()


def _tabelas(engine):
    return set(inspect(engine).get_table_names())


def _usuario_e_investimento(conexao):
    usuario, investimento = str(uuid4().hex), str(uuid4().hex)
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
    return investimento


def _operacao(conexao, posicao, **mudancas):
    valores = dict(
        id=uuid4().hex,
        posicao=posicao,
        tipo="COMPRA",
        quantidade="25",
        bruto=278930,
        custos=0,
        origem="pluggy",
        externo="pl-1",
    )
    valores.update(mudancas)
    conexao.execute(
        text(
            "INSERT INTO operacoes_de_investimento (id, posicao_id, tipo, data, quantidade, "
            "valor_bruto_centavos, custos_centavos, origem, id_externo) VALUES (:id, :posicao, "
            ":tipo, '2026-11-03', :quantidade, :bruto, :custos, :origem, :externo)"
        ),
        valores,
    )


def test_upgrade_cria_so_as_tabelas_novas_e_downgrade_remove_so_elas(banco):
    url, engine = banco
    antes = _tabelas(engine)
    assert not (TABELAS & antes)
    command.upgrade(_config(), NOVA)
    depois = _tabelas(criar_engine(url))
    assert depois >= TABELAS
    assert depois - TABELAS == antes
    command.downgrade(_config(), ANTERIOR)
    assert _tabelas(criar_engine(url)) == antes


def test_downgrade_nao_toca_nas_tabelas_antigas(banco):
    url, engine = banco
    command.upgrade(_config(), NOVA)
    with engine.begin() as c:
        _usuario_e_investimento(c)
    command.downgrade(_config(), ANTERIOR)
    with criar_engine(url).connect() as c:
        assert c.execute(text("SELECT count(*) FROM investimentos")).scalar() == 1
        assert c.execute(text("SELECT count(*) FROM usuarios")).scalar() == 1


@pytest.mark.parametrize(
    "mudancas",
    [
        {"bruto": -1},
        {"custos": -1},
        {"quantidade": "-1"},
        {"tipo": "OUTRO"},
        {"origem": "outra"},
        {"tipo": "ABERTURA", "origem": "abertura", "externo": "nao-pode"},
    ],
)
def test_checks_recusam_operacao_invalida(banco, mudancas):
    _, engine = banco
    command.upgrade(_config(), NOVA)
    with engine.begin() as c:
        posicao = _usuario_e_investimento(c)
    with pytest.raises(IntegrityError), engine.begin() as c:
        _operacao(c, posicao, **mudancas)


def test_idempotencia_por_posicao_e_id_externo(banco):
    _, engine = banco
    command.upgrade(_config(), NOVA)
    with engine.begin() as c:
        posicao = _usuario_e_investimento(c)
        _operacao(c, posicao)
    with pytest.raises(IntegrityError), engine.begin() as c:
        _operacao(c, posicao)


def test_abertura_e_manual_aceitam_varias_sem_id_externo(banco):
    _, engine = banco
    command.upgrade(_config(), NOVA)
    with engine.begin() as c:
        posicao = _usuario_e_investimento(c)
        for _ in range(2):
            _operacao(c, posicao, tipo="ABERTURA", origem="abertura", externo=None)
            _operacao(c, posicao, origem="manual", externo=None)


def test_alocacao_exige_peso_positivo_e_uma_por_posicao_e_destinacao(banco):
    _, engine = banco
    command.upgrade(_config(), NOVA)
    with engine.begin() as c:
        posicao = _usuario_e_investimento(c)
        usuario = c.execute(text("SELECT usuario_id FROM investimentos")).scalar()
        destinacao = uuid4().hex
        c.execute(
            text("INSERT INTO destinacoes_cadastradas (id, usuario_id, nome) VALUES (:d, :u, 'x')"),
            {"d": destinacao, "u": usuario},
        )
        c.execute(
            text(
                "INSERT INTO alocacoes_de_caixinha (posicao_id, destinacao_id, peso_centavos) "
                "VALUES (:p, :d, 100)"
            ),
            {"p": posicao, "d": destinacao},
        )
    for peso in (100, 0):
        with pytest.raises(IntegrityError), engine.begin() as c:
            c.execute(
                text(
                    "INSERT INTO alocacoes_de_caixinha (posicao_id, destinacao_id, "
                    "peso_centavos) VALUES (:p, :d, :w)"
                ),
                {"p": posicao, "d": destinacao, "w": peso},
            )


def test_um_casamento_por_operacao_e_cada_transacao_em_um_so(banco):
    _, engine = banco
    command.upgrade(_config(), NOVA)
    with engine.begin() as c:
        posicao = _usuario_e_investimento(c)
        operacao = uuid4().hex
        _operacao(c, posicao, id=operacao)
        c.execute(
            text(
                "INSERT INTO casamentos_de_operacao (id, operacao_id, estado) "
                "VALUES (:c, :o, 'confirmado')"
            ),
            {"c": uuid4().hex, "o": operacao},
        )
    with pytest.raises(IntegrityError), engine.begin() as c:
        c.execute(
            text(
                "INSERT INTO casamentos_de_operacao (id, operacao_id, estado) "
                "VALUES (:c, :o, 'confirmado')"
            ),
            {"c": uuid4().hex, "o": operacao},
        )
