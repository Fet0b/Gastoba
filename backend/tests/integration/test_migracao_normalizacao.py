"""Migration b6d1f4a82c35: 3FN em destinações e recorrências, e CHECKs de integridade.

Só dados fictícios, em SQLite temporário.
"""

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from gastoba.infrastructure.configuracoes import obter_configuracoes

ANTES = "9f4b2c7d6a10"
USUARIO = "00000000000000000000000000000001"
OUTRO_USUARIO = "00000000000000000000000000000002"
CONTA = "0000000000000000000000000000000a"
CONTA_DO_OUTRO = "0000000000000000000000000000000b"
INVESTIMENTO = "000000000000000000000000000000c1"
OUTRO_INVESTIMENTO = "000000000000000000000000000000c2"
MOVIMENTO = "000000000000000000000000000000d1"
MOVIMENTO_SEM_INVESTIMENTO = "000000000000000000000000000000d2"
RECORRENCIA = "000000000000000000000000000000e1"


@pytest.fixture
def url_banco(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/normalizacao.db"
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
    """Dados coerentes na versão anterior ao esquema novo."""
    _executar(
        engine,
        f"INSERT INTO usuarios (id, nome) VALUES ('{USUARIO}', 'Ana')",
        f"INSERT INTO usuarios (id, nome) VALUES ('{OUTRO_USUARIO}', 'Bia')",
        "INSERT INTO contas (id, usuario_id, nome, saldo_centavos, origem, tipo, id_externo) "
        f"VALUES ('{CONTA}', '{USUARIO}', 'Banco', 5000, 'open_finance', 'corrente', 'ext-1')",
        "INSERT INTO contas (id, usuario_id, nome, saldo_centavos, origem, tipo) "
        f"VALUES ('{CONTA_DO_OUTRO}', '{OUTRO_USUARIO}', 'Carteira', 100, 'manual', 'corrente')",
        "INSERT INTO investimentos (id, usuario_id, id_externo, nome, tipo, saldo_centavos, dados) "
        f"VALUES ('{INVESTIMENTO}', '{USUARIO}', 'i1', 'LCI', 'FIXED_INCOME', 1000, '{{}}')",
        "INSERT INTO investimentos (id, usuario_id, id_externo, nome, tipo, saldo_centavos, dados) "
        f"VALUES ('{OUTRO_INVESTIMENTO}', '{USUARIO}', 'i2', 'CDB', 'FIXED_INCOME', 1000, '{{}}')",
        "INSERT INTO movimentos_de_investimento (id, conta_id, investimento_id, tipo, descricao, "
        "valor_centavos, data, origem, revisao_pendente) "
        f"VALUES ('{MOVIMENTO}', '{CONTA}', '{INVESTIMENTO}', 'aporte', 'LCI', 600, "
        "'2026-10-05', 'open_finance', 0)",
        # Sem investimento no movimento, mas com destinações: a informação só existe nelas.
        "INSERT INTO movimentos_de_investimento (id, conta_id, investimento_id, tipo, descricao, "
        "valor_centavos, data, origem, revisao_pendente) "
        f"VALUES ('{MOVIMENTO_SEM_INVESTIMENTO}', '{CONTA}', NULL, 'aporte', 'CDB', 400, "
        "'2026-10-06', 'open_finance', 0)",
        "INSERT INTO destinacoes (id, movimento_id, investimento_id, tag, valor_centavos) "
        f"VALUES ('f1', '{MOVIMENTO}', '{INVESTIMENTO}', 'casa', 600)",
        "INSERT INTO destinacoes (id, movimento_id, investimento_id, tag, valor_centavos) "
        f"VALUES ('f2', '{MOVIMENTO_SEM_INVESTIMENTO}', '{OUTRO_INVESTIMENTO}', 'viagem', 400)",
        "INSERT INTO recorrencias (id, usuario_id, tipo, conta_id, valor_centavos, descricao, "
        "dia_do_mes, inicio, categoria, tags, ativa) "
        f"VALUES ('{RECORRENCIA}', '{USUARIO}', 'gasto', '{CONTA}', 300, 'Aluguel', 5, "
        "'2026-10-01', 'gasto_fixo', '[]', 1)",
    )


def _estado(engine):
    with engine.connect() as c:
        return {
            "movimentos": sorted(
                c.execute(
                    text(
                        "SELECT id, conta_id, valor_centavos, origem "
                        "FROM movimentos_de_investimento"
                    )
                ).all()
            ),
            "contas": sorted(c.execute(text("SELECT id, saldo_centavos FROM contas")).all()),
            "recorrencias": sorted(
                c.execute(text("SELECT id, conta_id, valor_centavos FROM recorrencias")).all()
            ),
        }


def test_upgrade_preserva_dados_e_copia_o_investimento_para_o_movimento(url_banco, config):
    engine = create_engine(url_banco)
    try:
        command.upgrade(config, ANTES)
        _semear(engine)
        antes = _estado(engine)

        command.upgrade(config, "b6d1f4a82c35")

        assert _estado(engine) == antes
        colunas = lambda t: {c["name"] for c in inspect(engine).get_columns(t)}  # noqa: E731
        assert "investimento_id" not in colunas("destinacoes")
        assert "usuario_id" not in colunas("recorrencias")
        with engine.connect() as c:
            investimentos = dict(
                c.execute(text("SELECT id, investimento_id FROM movimentos_de_investimento")).all()
            )
        assert investimentos[MOVIMENTO] == INVESTIMENTO
        assert investimentos[MOVIMENTO_SEM_INVESTIMENTO] == OUTRO_INVESTIMENTO
    finally:
        engine.dispose()


def test_downgrade_devolve_as_colunas_com_os_mesmos_valores(url_banco, config):
    engine = create_engine(url_banco)
    try:
        command.upgrade(config, ANTES)
        _semear(engine)
        command.upgrade(config, "b6d1f4a82c35")

        command.downgrade(config, ANTES)

        with engine.connect() as c:
            destinacoes = dict(c.execute(text("SELECT id, investimento_id FROM destinacoes")).all())
            donos = c.execute(text("SELECT usuario_id FROM recorrencias")).scalars().all()
        assert destinacoes == {"f1": INVESTIMENTO, "f2": OUTRO_INVESTIMENTO}
        assert donos == [USUARIO]
    finally:
        engine.dispose()


@pytest.mark.parametrize(
    ("regra", "sabotagem"),
    [
        (
            "destinação de outro investimento",
            f"UPDATE destinacoes SET investimento_id = '{OUTRO_INVESTIMENTO}' WHERE id = 'f1'",
        ),
        (
            "tag repetida no movimento",
            "INSERT INTO destinacoes (id, movimento_id, investimento_id, tag, valor_centavos) "
            f"VALUES ('f3', '{MOVIMENTO}', '{INVESTIMENTO}', 'casa', 1)",
        ),
        (
            "dois investimentos para um movimento sem investimento",
            "INSERT INTO destinacoes (id, movimento_id, investimento_id, tag, valor_centavos) "
            f"VALUES ('f3', '{MOVIMENTO_SEM_INVESTIMENTO}', '{INVESTIMENTO}', 'outra', 1)",
        ),
        (
            "recorrência de um usuário na conta de outro",
            f"UPDATE recorrencias SET usuario_id = '{OUTRO_USUARIO}'",
        ),
        (
            "conta importada sem id externo",
            f"UPDATE contas SET id_externo = NULL WHERE id = '{CONTA}'",
        ),
        (
            "recorrência de uma conta que não existe",
            "INSERT INTO recorrencias (id, usuario_id, tipo, conta_id, valor_centavos, descricao, "
            "dia_do_mes, inicio, categoria, tags, ativa) VALUES ('r2', "
            f"'{USUARIO}', 'gasto', '000000000000000000000000000000ff', 1, 'x', 5, "
            "'2026-10-01', 'lazer', '[]', 1)",
        ),
        (
            "gasto de recorrência sem categoria",
            f"UPDATE recorrencias SET categoria = NULL WHERE id = '{RECORRENCIA}'",
        ),
        (
            "movimento sem conta fora do saldo inicial",
            f"UPDATE movimentos_de_investimento SET conta_id = NULL WHERE id = '{MOVIMENTO}'",
        ),
        (
            "saldo inicial sem investimento",
            "INSERT INTO movimentos_de_investimento (id, conta_id, investimento_id, tipo, "
            "descricao, valor_centavos, data, origem, revisao_pendente) "
            "VALUES ('s1', NULL, NULL, 'aporte', 'x', 1, '2026-10-01', 'saldo_inicial', 0)",
        ),
        (
            "movimento com origem desconhecida",
            f"UPDATE movimentos_de_investimento SET origem = 'outra' WHERE id = '{MOVIMENTO}'",
        ),
        (
            "realocação com a mesma tag",
            "INSERT INTO realocacoes (id, investimento_id, data, tag_origem, tag_destino, "
            f"valor_centavos) VALUES ('l1', '{INVESTIMENTO}', '2026-10-01', 'casa', 'casa', 1)",
        ),
        (
            "conta com origem desconhecida",
            f"UPDATE contas SET origem = 'outra' WHERE id = '{CONTA_DO_OUTRO}'",
        ),
        (
            "gasto com origem desconhecida",
            "INSERT INTO gastos (id, conta_id, descricao, valor_centavos, data, tags, categoria, "
            f"origem) VALUES ('q1', '{CONTA}', 'x', 1, '2026-10-01', '[]', 'lazer', 'outra')",
        ),
        (
            "ganho com origem desconhecida",
            "INSERT INTO ganhos (id, conta_id, descricao, valor_centavos, data, tags, origem) "
            f"VALUES ('q2', '{CONTA}', 'x', 1, '2026-10-01', '[]', 'outra')",
        ),
        (
            "transação importada com sentido desconhecido",
            "INSERT INTO transacoes_importadas (id, conta_id, id_externo, data, descricao, "
            "valor_centavos, sentido, estado) "
            f"VALUES ('a2', '{CONTA}', 'z', '2026-10-01', 'Teste', 1, 'lado', 'pendente')",
        ),
        (
            "estado desconhecido",
            "INSERT INTO transacoes_importadas (id, conta_id, id_externo, data, descricao, "
            "valor_centavos, sentido, estado) "
            f"VALUES ('a1', '{CONTA}', 'x', '2026-10-01', 'Teste', 1, 'saida', 'estranho')",
        ),
    ],
)
def test_upgrade_para_sem_alterar_nada_quando_os_dados_violam_as_regras(
    url_banco, config, regra, sabotagem
):
    engine = create_engine(url_banco)
    try:
        command.upgrade(config, ANTES)
        _semear(engine)
        _executar(engine, sabotagem)
        antes = _estado(engine)

        with pytest.raises(RuntimeError, match="parou sem alterar nada"):
            command.upgrade(config, "b6d1f4a82c35")

        assert _estado(engine) == antes, regra
        with engine.connect() as c:
            versao = c.execute(text("SELECT version_num FROM alembic_version")).scalar()
        assert versao == ANTES
        assert "investimento_id" in {c["name"] for c in inspect(engine).get_columns("destinacoes")}
        # Nem o investimento do movimento foi copiado antes de a verificação passar.
        with engine.connect() as c:
            assert (
                c.execute(
                    text(
                        "SELECT investimento_id FROM movimentos_de_investimento "
                        f"WHERE id = '{MOVIMENTO_SEM_INVESTIMENTO}'"
                    )
                ).scalar()
                is None
            )
    finally:
        engine.dispose()


def test_mensagem_de_aborto_nao_traz_ids_nem_valores(url_banco, config):
    engine = create_engine(url_banco)
    try:
        command.upgrade(config, ANTES)
        _semear(engine)
        _executar(engine, f"UPDATE recorrencias SET usuario_id = '{OUTRO_USUARIO}'")

        with pytest.raises(RuntimeError) as erro:
            command.upgrade(config, "b6d1f4a82c35")

        mensagem = str(erro.value)
        assert "recorrência cujo usuario_id difere" in mensagem
        for segredo in (USUARIO, OUTRO_USUARIO, CONTA, "Aluguel"):
            assert segredo not in mensagem
    finally:
        engine.dispose()


@pytest.mark.parametrize(
    "violacao",
    [
        # destinação repetida
        "INSERT INTO destinacoes (id, movimento_id, tag, valor_centavos) "
        f"VALUES ('g1', '{MOVIMENTO}', 'casa', 1)",
        # saldo inicial com conta
        "INSERT INTO movimentos_de_investimento (id, conta_id, investimento_id, tipo, descricao, "
        "valor_centavos, data, origem, revisao_pendente) "
        f"VALUES ('g2', '{CONTA}', '{INVESTIMENTO}', 'aporte', 'x', 1, '2026-10-01', "
        "'saldo_inicial', 0)",
        # movimento sem conta fora do saldo inicial
        "INSERT INTO movimentos_de_investimento (id, conta_id, investimento_id, tipo, descricao, "
        "valor_centavos, data, origem, revisao_pendente) "
        f"VALUES ('g3', NULL, '{INVESTIMENTO}', 'aporte', 'x', 1, '2026-10-01', 'manual', 0)",
        # saldo inicial sem investimento
        "INSERT INTO movimentos_de_investimento (id, conta_id, investimento_id, tipo, descricao, "
        "valor_centavos, data, origem, revisao_pendente) "
        "VALUES ('g4', NULL, NULL, 'aporte', 'x', 1, '2026-10-01', 'saldo_inicial', 0)",
        # origem desconhecida
        "INSERT INTO movimentos_de_investimento (id, conta_id, investimento_id, tipo, descricao, "
        "valor_centavos, data, origem, revisao_pendente) "
        f"VALUES ('g5', '{CONTA}', '{INVESTIMENTO}', 'aporte', 'x', 1, '2026-10-01', 'outra', 0)",
        # realocação com a mesma tag
        "INSERT INTO realocacoes (id, investimento_id, data, tag_origem, tag_destino, "
        f"valor_centavos) VALUES ('g6', '{INVESTIMENTO}', '2026-10-01', 'casa', 'casa', 1)",
        # gasto de recorrência sem categoria
        "INSERT INTO recorrencias (id, tipo, conta_id, valor_centavos, descricao, dia_do_mes, "
        f"inicio, categoria, tags, ativa) VALUES ('g7', 'gasto', '{CONTA}', 1, 'x', 5, "
        "'2026-10-01', NULL, '[]', 1)",
        # ganho de recorrência com categoria
        "INSERT INTO recorrencias (id, tipo, conta_id, valor_centavos, descricao, dia_do_mes, "
        f"inicio, categoria, tags, ativa) VALUES ('g8', 'ganho', '{CONTA}', 1, 'x', 5, "
        "'2026-10-01', 'lazer', '[]', 1)",
        # conta manual com id externo
        "INSERT INTO contas (id, usuario_id, nome, saldo_centavos, origem, tipo, id_externo) "
        f"VALUES ('g9', '{USUARIO}', 'Outra', 0, 'manual', 'corrente', 'ext-9')",
        # conta importada sem id externo
        "INSERT INTO contas (id, usuario_id, nome, saldo_centavos, origem, tipo) "
        f"VALUES ('g10', '{USUARIO}', 'Outra2', 0, 'open_finance', 'corrente')",
        # transação importada com sentido desconhecido
        "INSERT INTO transacoes_importadas (id, conta_id, id_externo, data, descricao, "
        "valor_centavos, sentido, estado) "
        f"VALUES ('g11', '{CONTA}', 'y', '2026-10-01', 'T', 1, 'lado', 'pendente')",
    ],
)
def test_esquema_novo_recusa_o_que_as_regras_proibem(url_banco, config, violacao):
    engine = create_engine(url_banco)
    try:
        command.upgrade(config, ANTES)
        _semear(engine)
        command.upgrade(config, "b6d1f4a82c35")

        with pytest.raises(IntegrityError):
            _executar(engine, violacao)
    finally:
        engine.dispose()


def test_esquema_novo_aceita_o_saldo_inicial_e_a_recorrencia_de_ganho(url_banco, config):
    engine = create_engine(url_banco)
    try:
        command.upgrade(config, ANTES)
        _semear(engine)
        command.upgrade(config, "b6d1f4a82c35")

        _executar(
            engine,
            "INSERT INTO movimentos_de_investimento (id, conta_id, investimento_id, tipo, "
            "descricao, valor_centavos, data, origem, revisao_pendente) "
            f"VALUES ('h1', NULL, '{INVESTIMENTO}', 'aporte', 'Saldo inicial', 1, '2026-10-01', "
            "'saldo_inicial', 0)",
            "INSERT INTO recorrencias (id, tipo, conta_id, valor_centavos, descricao, "
            "dia_do_mes, inicio, categoria, tags, ativa) "
            f"VALUES ('h2', 'ganho', '{CONTA}', 1, 'Salário', 5, '2026-10-01', NULL, '[]', 1)",
        )
    finally:
        engine.dispose()


def test_falha_no_meio_nao_deixa_o_banco_meio_migrado(url_banco, config, monkeypatch):
    engine = create_engine(url_banco)
    try:
        command.upgrade(config, ANTES)
        _semear(engine)
        antes = _estado(engine)
        from alembic.operations.batch import BatchOperationsImpl

        original = BatchOperationsImpl.add_constraint

        def quebrar_na_ultima_etapa(self, const):
            if const.name and "categoria_so_no_gasto" in const.name:
                raise RuntimeError("falha simulada na última etapa")
            return original(self, const)

        # A última etapa falha: tudo o que veio antes (cópia, colunas, índices) precisa desfazer.
        monkeypatch.setattr(BatchOperationsImpl, "add_constraint", quebrar_na_ultima_etapa)

        with pytest.raises(RuntimeError, match="falha simulada"):
            command.upgrade(config, "b6d1f4a82c35")

        assert _estado(engine) == antes
        with engine.connect() as c:
            assert c.execute(text("SELECT version_num FROM alembic_version")).scalar() == ANTES
            assert (
                c.execute(
                    text(
                        "SELECT investimento_id FROM movimentos_de_investimento "
                        f"WHERE id = '{MOVIMENTO_SEM_INVESTIMENTO}'"
                    )
                ).scalar()
                is None
            )
            restos = c.execute(
                text("SELECT name FROM sqlite_master WHERE name LIKE '%alembic_tmp%'")
            ).all()
        assert restos == []
        colunas = lambda t: {c["name"] for c in inspect(engine).get_columns(t)}  # noqa: E731
        assert "investimento_id" in colunas("destinacoes")
        assert "usuario_id" in colunas("recorrencias")
    finally:
        engine.dispose()
