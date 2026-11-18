"""055: backfill e rollback estrutural apenas em SQLite temporário."""

import json
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from gastoba.infrastructure.configuracoes import obter_configuracoes

ANTES = "e6fa0483c12d"
DEPOIS = "f70b1594d23e"


@pytest.fixture
def banco(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/normalizacao.db"
    monkeypatch.setenv("GASTOBA_URL_BANCO", url)
    obter_configuracoes.cache_clear()
    config = Config()
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[2] / "migrations")
    )
    command.upgrade(config, ANTES)
    engine = create_engine(url)
    pessoa, conta, gasto, movimento, parte = [uuid4().hex for _ in range(5)]
    with engine.begin() as c:
        c.execute(text("INSERT INTO usuarios(id,nome) VALUES (:p,'Pessoa')"), {"p": pessoa})
        c.execute(
            text(
                "INSERT INTO contas(id,usuario_id,nome,saldo_centavos,origem,tipo) "
                "VALUES (:c,:p,'Conta',500,'manual','corrente')"
            ),
            {"c": conta, "p": pessoa},
        )
        c.execute(
            text(
                "INSERT INTO gastos(id,conta_id,descricao,valor_centavos,data,tags,"
                "categoria,origem) VALUES "
                "(:g,:c,'Teste',321,'2026-11-08',:tags,'lazer','manual')"
            ),
            {"g": gasto, "c": conta, "tags": json.dumps(["z", "a"])},
        )
        c.execute(
            text(
                "INSERT INTO movimentos_de_investimento(id,conta_id,descricao,valor"
                "_centavos,data,tipo,origem) VALUES "
                "(:m,:c,'Teste',100,'2026-11-08','aporte','manual')"
            ),
            {"m": movimento, "c": conta},
        )
        c.execute(
            text(
                "INSERT INTO destinacoes(id,movimento_id,tag,valor_centavos,categor"
                "ia) VALUES (:d,:m,'viagem',100,'lazer')"
            ),
            {"d": parte, "m": movimento},
        )
    yield config, engine, conta, gasto, parte
    engine.dispose()
    obter_configuracoes.cache_clear()


def test_upgrade_downgrade_preserva_ids_valores_tags_ordenadas_e_categoria(banco):
    config, engine, conta, gasto, parte = banco
    command.upgrade(config, DEPOIS)
    with engine.connect() as c:
        assert "tags" not in {col["name"] for col in inspect(c).get_columns("gastos")}
        nomes = (
            c.execute(
                text(
                    "SELECT t.nome FROM tags_de_gastos a JOIN tags t ON t.id=a.tag_id "
                    "ORDER BY a.ordem"
                )
            )
            .scalars()
            .all()
        )
        assert nomes == ["z", "a"]
        assert c.execute(text("SELECT id, valor_centavos FROM gastos")).one() == (gasto, 321)
        assert c.execute(
            text(
                "SELECT d.id,c.nome,d.valor_centavos,d.categoria FROM destinacoes "
                "d JOIN destinacoes_cadastradas c ON c.id=d.destinacao_id"
            )
        ).one() == (parte, "viagem", 100, "lazer")
        assert c.execute(text("PRAGMA foreign_key_check")).all() == []
    command.downgrade(config, ANTES)
    with engine.connect() as c:
        assert json.loads(c.execute(text("SELECT tags FROM gastos")).scalar_one()) == ["z", "a"]
        assert c.execute(text("SELECT id,tag,valor_centavos,categoria FROM destinacoes")).one() == (
            parte,
            "viagem",
            100,
            "lazer",
        )
    command.upgrade(config, DEPOIS)
    assert "destinacoes_cadastradas" in inspect(engine).get_table_names()


def test_migration_recusa_json_invalido_antes_de_alterar_esquema(banco):
    config, engine, *_ = banco
    with engine.begin() as c:
        c.execute(text("UPDATE gastos SET tags='{}'"))
    with pytest.raises(RuntimeError, match="tags"):
        command.upgrade(config, DEPOIS)
    assert "destinacoes_cadastradas" not in inspect(engine).get_table_names()
    assert "tags" in {col["name"] for col in inspect(engine).get_columns("gastos")}


def test_falha_de_ddl_nao_deixa_esquema_parcial(banco, monkeypatch):
    from alembic.operations.batch import BatchOperationsImpl

    config, engine, *_ = banco

    def falhar(*args, **kwargs):
        raise RuntimeError("falha simulada no DDL")

    monkeypatch.setattr(BatchOperationsImpl, "add_column", falhar)
    with pytest.raises(RuntimeError, match="falha simulada"):
        command.upgrade(config, DEPOIS)
    assert "destinacoes_cadastradas" not in inspect(engine).get_table_names()
    assert "tags" not in inspect(engine).get_table_names()
    with engine.connect() as c:
        assert c.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == ANTES


def test_backfill_da_conta_remunerada_e_independente_de_id_externo(banco):
    config, engine, conta, *_ = banco
    inv = uuid4().hex
    with engine.begin() as c:
        pessoa = c.execute(
            text("SELECT usuario_id FROM contas WHERE id=:c"), {"c": conta}
        ).scalar_one()
        c.execute(
            text(
                "INSERT INTO investimentos(id,usuario_id,id_externo,nome,tipo,"
                "saldo_centavos,dados) "
                "VALUES (:i,:u,:e,'Remunerada','CAIXINHA',700,'{}')"
            ),
            {"i": inv, "u": pessoa, "e": "caixinha:" + str(uuid4())},
        )
    with pytest.raises(RuntimeError, match="remunerada"):
        command.upgrade(config, DEPOIS)
    assert "destinacoes_cadastradas" not in inspect(engine).get_table_names()
    with engine.begin() as c:
        c.execute(text("UPDATE investimentos SET id_externo=:e"), {"e": "caixinha:" + conta})
    command.upgrade(config, DEPOIS)
    with engine.begin() as c:
        assert c.execute(
            text("SELECT conta_remunerada_id,saldo_centavos FROM investimentos")
        ).one() == (conta, 700)
        c.execute(text("UPDATE investimentos SET id_externo='identidade-independente'"))
        assert (
            c.execute(text("SELECT conta_remunerada_id FROM investimentos")).scalar_one() == conta
        )


def test_migration_preserva_tags_de_ganho_e_recorrencia_com_ordem(banco):
    config, engine, conta, *_ = banco
    ganho, recorrencia = uuid4().hex, uuid4().hex
    with engine.begin() as c:
        c.execute(
            text(
                "INSERT INTO ganhos(id,conta_id,descricao,valor_centavos,data,tags,origem) "
                "VALUES (:i,:c,'Ganho',100,'2026-11-08',:t,'manual')"
            ),
            {"i": ganho, "c": conta, "t": json.dumps(["z", "a"])},
        )
        c.execute(
            text(
                "INSERT INTO recorrencias(id,conta_id,tipo,descricao,valor_centavos,"
                "dia_do_mes,inicio,tags,ativa) "
                "VALUES (:i,:c,'ganho','Salário',100,1,'2026-11-01',:t,1)"
            ),
            {"i": recorrencia, "c": conta, "t": json.dumps(["a", "z"])},
        )
    command.upgrade(config, DEPOIS)
    with engine.connect() as c:
        for tabela, esperado in [("ganhos", ["z", "a"]), ("recorrencias", ["a", "z"])]:
            assert (
                c.execute(
                    text(
                        f"SELECT t.nome FROM tags_de_{tabela} a JOIN tags t ON t.id=a.tag_id "
                        "ORDER BY a.ordem"
                    )
                )
                .scalars()
                .all()
                == esperado
            )
    command.downgrade(config, ANTES)
    with engine.connect() as c:
        assert json.loads(c.execute(text("SELECT tags FROM ganhos")).scalar_one()) == ["z", "a"]
        assert json.loads(c.execute(text("SELECT tags FROM recorrencias")).scalar_one()) == [
            "a",
            "z",
        ]


def test_reserva_legada_divergente_interrompe_antes_do_ddl(banco):
    config, engine, conta, *_ = banco
    outra_conta, ponta, transferencia = uuid4().hex, uuid4().hex, uuid4().hex
    with engine.begin() as c:
        pessoa = c.execute(
            text("SELECT usuario_id FROM contas WHERE id=:i"), {"i": conta}
        ).scalar_one()
        c.execute(
            text(
                "INSERT INTO contas(id,usuario_id,nome,saldo_centavos,origem,tipo) "
                "VALUES (:i,:u,'Destino',0,'manual','corrente')"
            ),
            {"i": outra_conta, "u": pessoa},
        )
        c.execute(
            text(
                "INSERT INTO transacoes_importadas(id,conta_id,id_externo,descricao,"
                "valor_centavos,data,sentido,estado) "
                "VALUES (:i,:c,'ponta','Teste',100,'2026-11-08','saida','aceita')"
            ),
            {"i": ponta, "c": conta},
        )
        c.execute(
            text(
                "INSERT INTO transferencias_entre_contas(id,usuario_id,conta_origem_id,"
                "conta_destino_id,valor_centavos,data,papel_origem,papel_destino,"
                "transacao_origem_id,competencia_provisoria,ativa) "
                "VALUES (:i,:u,:o,:d,100,'2026-11-08','corrente','investimento',:p,1,1)"
            ),
            {"i": transferencia, "u": pessoa, "o": conta, "d": outra_conta, "p": ponta},
        )
    with pytest.raises(RuntimeError, match="reservas"):
        command.upgrade(config, DEPOIS)
    assert "destinacoes_cadastradas" not in inspect(engine).get_table_names()
