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
    "investimentos",
    "movimentos_de_investimento",
    "destinacoes",
    "realocacoes",
    "investimentos_historico",
    "rendas_base",
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


def test_migration_da_renda_base_cria_tabela_vazia_sem_mudar_registros(url_banco, config):
    engine = create_engine(url_banco)
    try:
        command.upgrade(config, "552bd1f93894")
        with engine.begin() as conexao:
            conexao.execute(
                text("INSERT INTO usuarios (id, nome) VALUES (:id, 'Pessoa exemplo')"),
                {"id": _USUARIO},
            )
            conexao.execute(
                text(
                    "INSERT INTO contas (id, usuario_id, nome, saldo_centavos, origem, tipo) "
                    "VALUES (:id, :usuario, 'Conta exemplo', 12345, 'manual', 'corrente')"
                ),
                {"id": _CONTA, "usuario": _USUARIO},
            )
        command.upgrade(config, "head")

        assert "rendas_base" in inspect(engine).get_table_names()
        inspetor = inspect(engine)
        assert inspetor.get_pk_constraint("rendas_base")["constrained_columns"] == ["usuario_id"]
        assert inspetor.get_foreign_keys("rendas_base")[0]["referred_table"] == "usuarios"
        assert {c["name"] for c in inspetor.get_check_constraints("rendas_base")} == {
            "ck_rendas_base_valor_positivo"
        }
        with engine.connect() as conexao:
            assert conexao.execute(text("SELECT count(*) FROM rendas_base")).scalar_one() == 0
            assert conexao.execute(text("SELECT saldo_centavos FROM contas")).scalar_one() == 12345
        command.downgrade(config, "552bd1f93894")
        assert "rendas_base" not in inspect(engine).get_table_names()
        with engine.connect() as conexao:
            assert conexao.execute(text("SELECT saldo_centavos FROM contas")).scalar_one() == 12345
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
            gasto = conexao.execute(text("SELECT descricao, valor_centavos, categoria FROM gastos"))
            assert tuple(usuario.one()) == (_USUARIO, "Ana", None, None)
            assert tuple(conta.one()) == ("Carteira", 5000, "corrente")
            assert tuple(gasto.one()) == ("Pão", 750, "conforto")
            assert conexao.execute(
                text(
                    "SELECT t.nome FROM tags_de_gastos a JOIN tags t ON t.id=a.tag_id "
                    "ORDER BY a.ordem"
                )
            ).scalars().all() == ["mercado"]

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


def test_upgrade_renomeia_contas_importadas_que_exibem_parte_do_id_externo(url_banco, config):
    engine = create_engine(url_banco)
    usuario = "00000000000000000000000000000002"
    contas = [
        # (id, nome, origem, id_externo)
        ("00000000000000000000000000000011", "BTG Banking", "open_finance", "f88ef1aa-1"),
        ("00000000000000000000000000000012", "BTG Banking (f88ef1)", "open_finance", "f88ef1aa-2"),
        ("00000000000000000000000000000013", "BTG Banking (aaaaaa)", "open_finance", "bbbbbbbb-3"),
        # O trecho não é do id da própria conta: é o nome que a pessoa escolheu, fica como está.
        ("00000000000000000000000000000014", "Reserva (abcdef)", "manual", None),
        ("00000000000000000000000000000015", "Outro (abcdef)", "open_finance", "zzzzzzzz-9"),
    ]
    try:
        command.upgrade(config, "c3e7a1d94b20")
        with engine.begin() as conexao:
            conexao.execute(text(f"INSERT INTO usuarios (id, nome) VALUES ('{usuario}', 'Ana')"))
            for id_, nome, origem, id_externo in contas:
                conexao.execute(
                    text(
                        "INSERT INTO contas (id, usuario_id, nome, saldo_centavos, origem, "
                        "id_externo, tipo) VALUES (:id, :u, :nome, 0, :origem, :ext, 'corrente')"
                    ),
                    {"id": id_, "u": usuario, "nome": nome, "origem": origem, "ext": id_externo},
                )

        command.upgrade(config, "head")

        with engine.connect() as conexao:
            nomes = dict(conexao.execute(text("SELECT id, nome FROM contas")).all())
        assert nomes["00000000000000000000000000000011"] == "BTG Banking"
        # Só o trecho que é o começo do id_externo da própria conta sai; o resto não muda.
        assert nomes["00000000000000000000000000000012"] == "BTG Banking (2)"
        assert nomes["00000000000000000000000000000013"] == "BTG Banking (aaaaaa)"
        assert nomes["00000000000000000000000000000014"] == "Reserva (abcdef)"
        assert nomes["00000000000000000000000000000015"] == "Outro (abcdef)"
    finally:
        engine.dispose()


def test_migration_converte_gastos_de_investimento_em_aportes_e_desfaz(url_banco, config):
    engine = create_engine(url_banco)
    try:
        command.upgrade(config, "c3e7a1d94b20")
        with engine.begin() as conexao:
            conexao.execute(text(f"INSERT INTO usuarios (id, nome) VALUES ('{_USUARIO}', 'Ana')"))
            conexao.execute(
                text(
                    "INSERT INTO contas (id, usuario_id, nome, saldo_centavos, origem, tipo, "
                    "id_externo) "
                    f"VALUES ('{_CONTA}', '{_USUARIO}', 'Banco', 5000, 'open_finance', 'corrente', "
                    "'externa-1')"
                )
            )
            for id_, categoria in ((_GASTO, "investimentos"), ("g2", "conforto")):
                conexao.execute(
                    text(
                        "INSERT INTO gastos (id, conta_id, descricao, valor_centavos, data, "
                        f"tags, categoria, origem) VALUES ('{id_}', '{_CONTA}', 'LCI', 100000, "
                        f"'2026-10-05', '[]', '{categoria}', 'open_finance')"
                    )
                )

        command.upgrade(config, "head")

        with engine.connect() as conexao:
            movimentos = conexao.execute(
                text(
                    "SELECT id, tipo, valor_centavos, investimento_id "
                    "FROM movimentos_de_investimento"
                )
            ).all()
            gastos = conexao.execute(text("SELECT id, categoria FROM gastos")).all()
        assert [tuple(m) for m in movimentos] == [(_GASTO, "aporte", 100000, None)]
        assert [tuple(g) for g in gastos] == [("g2", "conforto")]

        command.downgrade(config, "c3e7a1d94b20")

        with engine.connect() as conexao:
            gastos = conexao.execute(text("SELECT id, categoria FROM gastos ORDER BY id")).all()
        assert len(gastos) == 2
        assert (_GASTO, "investimentos") in [tuple(g) for g in gastos]
    finally:
        engine.dispose()


def test_migration_do_saldo_inicial_aceita_movimento_sem_conta_e_o_downgrade_o_apaga(
    url_banco, config
):
    engine = create_engine(url_banco)
    investimento = "0000000000000000000000000000000c"
    aporte = "0000000000000000000000000000000d"
    saldo_inicial = "0000000000000000000000000000000e"
    try:
        command.upgrade(config, "c0539990298a")
        with engine.begin() as conexao:
            conexao.execute(text(f"INSERT INTO usuarios (id, nome) VALUES ('{_USUARIO}', 'Ana')"))
            conexao.execute(
                text(
                    "INSERT INTO contas (id, usuario_id, nome, saldo_centavos, origem, tipo, "
                    "id_externo) "
                    f"VALUES ('{_CONTA}', '{_USUARIO}', 'Banco', 5000, 'open_finance', 'corrente', "
                    "'externa-1')"
                )
            )
            conexao.execute(
                text(
                    "INSERT INTO investimentos (id, usuario_id, id_externo, nome, tipo, "
                    f"saldo_centavos, dados) VALUES ('{investimento}', '{_USUARIO}', 'lci', "
                    "'LCI', 'FIXED_INCOME', 100000, '{}')"
                )
            )
            conexao.execute(
                text(
                    "INSERT INTO movimentos_de_investimento (id, conta_id, investimento_id, tipo, "
                    f"descricao, valor_centavos, data, origem) VALUES ('{aporte}', '{_CONTA}', "
                    f"'{investimento}', 'aporte', 'LCI', 60000, '2026-10-05', 'open_finance')"
                )
            )

        command.upgrade(config, "e6fa0483c12d")

        with engine.begin() as conexao:
            conexao.execute(
                text(
                    "INSERT INTO movimentos_de_investimento (id, conta_id, investimento_id, tipo, "
                    f"descricao, valor_centavos, data, origem) VALUES ('{saldo_inicial}', NULL, "
                    f"'{investimento}', 'aporte', 'Saldo inicial', 40000, '2026-10-22', "
                    "'saldo_inicial')"
                )
            )
            for id_, movimento in (("f1", aporte), ("f2", saldo_inicial)):
                conexao.execute(
                    text(
                        "INSERT INTO destinacoes (id, movimento_id, tag, valor_centavos) "
                        f"VALUES ('{id_}', '{movimento}', 'casa', 1)"
                    )
                )
        colunas = {c["name"]: c for c in inspect(engine).get_columns("movimentos_de_investimento")}
        assert colunas["conta_id"]["nullable"] is True

        command.downgrade(config, "c0539990298a")

        colunas = {c["name"]: c for c in inspect(engine).get_columns("movimentos_de_investimento")}
        assert colunas["conta_id"]["nullable"] is False
        with engine.connect() as conexao:
            movimentos = conexao.execute(text("SELECT id FROM movimentos_de_investimento")).all()
            destinacoes = conexao.execute(text("SELECT movimento_id FROM destinacoes")).all()
        assert [tuple(m) for m in movimentos] == [(aporte,)]
        assert [tuple(d) for d in destinacoes] == [(aporte,)]
    finally:
        engine.dispose()


def test_migration_do_vinculo_preserva_todos_os_lancamentos_e_desfaz_so_o_esquema(
    url_banco, config
):
    engine = create_engine(url_banco)
    tabelas = ["gastos", "ganhos", "movimentos_de_investimento"]
    try:
        command.upgrade(config, "7f2a8b9c4d10")
        with engine.begin() as conexao:
            conexao.execute(
                text("INSERT INTO usuarios (id, nome) VALUES (:id, 'Pessoa exemplo')"),
                {"id": _USUARIO},
            )
            conexao.execute(
                text(
                    "INSERT INTO contas (id, usuario_id, nome, saldo_centavos, origem, tipo, "
                    "id_externo) "
                    "VALUES (:id, :usuario, 'Banco exemplo', 12345, 'open_finance', 'corrente', "
                    "'externa-1')"
                ),
                {"id": _CONTA, "usuario": _USUARIO},
            )
            for numero, tabela in enumerate(tabelas, 1):
                extra_colunas = (
                    ", categoria, tags"
                    if tabela == "gastos"
                    else ", tags"
                    if tabela == "ganhos"
                    else ", tipo"
                )
                extra_valores = (
                    ", 'lazer', '[]'"
                    if tabela == "gastos"
                    else ", '[]'"
                    if tabela == "ganhos"
                    else ", 'aporte'"
                )
                conexao.execute(
                    text(
                        f"INSERT INTO {tabela} (id, conta_id, descricao, valor_centavos, "
                        f"data, origem{extra_colunas}) "
                        "VALUES (:id, :conta, 'Exemplo', 100, '2026-10-05', "
                        f"'open_finance'{extra_valores})"
                    ),
                    {"id": str(numero).zfill(32), "conta": _CONTA},
                )
            antes = {
                t: [dict(linha) for linha in conexao.execute(text(f"SELECT * FROM {t}")).mappings()]
                for t in tabelas
            }
        command.upgrade(config, "8c3d9e1a6b20")
        for tabela in tabelas:
            inspetor = inspect(engine)
            colunas = {c["name"]: c for c in inspetor.get_columns(tabela)}
            assert "transacao_importada_id" in colunas
            assert colunas["transacao_importada_id"]["nullable"] is True
            assert any(
                f["constrained_columns"] == ["transacao_importada_id"]
                and f["referred_table"] == "transacoes_importadas"
                for f in inspetor.get_foreign_keys(tabela)
            )
            assert {i["name"]: i["unique"] for i in inspetor.get_indexes(tabela)}[
                f"ix_{tabela}_transacao_importada_id"
            ] == 0
            with engine.connect() as conexao:
                [lido] = conexao.execute(text(f"SELECT * FROM {tabela}")).mappings()
                dados = dict(lido)
                assert dados.pop("transacao_importada_id") is None
                assert [dados] == antes[tabela]
        command.downgrade(config, "7f2a8b9c4d10")
        with engine.connect() as conexao:
            for tabela in tabelas:
                assert [
                    dict(linha)
                    for linha in conexao.execute(text(f"SELECT * FROM {tabela}")).mappings()
                ] == antes[tabela]
            assert conexao.execute(text("SELECT saldo_centavos FROM contas")).scalar_one() == 12345
    finally:
        engine.dispose()
