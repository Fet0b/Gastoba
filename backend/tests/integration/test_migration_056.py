from pathlib import Path
from runpy import run_path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from gastoba.infrastructure.configuracoes import obter_configuracoes


@pytest.mark.parametrize(
    "transacoes,lancamentos,descricao,sentido,esperado",
    [
        (1, 1, "Exemplo", "saida", 1),
        (1, 0, "Exemplo", "saida", 0),
        (1, 2, "Exemplo", "saida", 0),
        (2, 1, "Exemplo", "saida", 0),
        (1, 1, "Diferente", "saida", 0),
        (1, 1, "Exemplo", "entrada", 0),
    ],
)
def test_migrations_preservam_dados_e_religam_so_correspondencias_exclusivas(
    tmp_path, monkeypatch, transacoes, lancamentos, descricao, sentido, esperado
):
    url = f"sqlite:///{tmp_path}/056.db"
    monkeypatch.setenv("GASTOBA_URL_BANCO", url)
    obter_configuracoes.cache_clear()
    cfg = Config()
    cfg.set_main_option("script_location", str(Path(__file__).resolve().parents[2] / "migrations"))
    engine = create_engine(url)
    try:
        command.upgrade(cfg, "f70b1594d23e")
        dono, conta, meta, destino = [uuid4().hex for _ in range(4)]
        with engine.begin() as c:
            c.execute(text("INSERT INTO usuarios(id,nome) VALUES (:id,'Exemplo')"), {"id": dono})
            c.execute(
                text(
                    "INSERT INTO contas(id,usuario_id,nome,saldo_centavos,origem,tipo) VALUES "
                    "(:id,:dono,'Exemplo',12345,'manual','corrente')"
                ),
                {"id": conta, "dono": dono},
            )
            c.execute(
                text(
                    "INSERT INTO metas(id,usuario_id,categoria,percentual) "
                    "VALUES (:id,:dono,'lazer',19)"
                ),
                {"id": meta, "dono": dono},
            )
            c.execute(
                text(
                    "INSERT INTO destinacoes_cadastradas(id,usuario_id,nome) "
                    "VALUES (:id,:dono,'viagem')"
                ),
                {"id": destino, "dono": dono},
            )
            c.execute(
                text(
                    "INSERT INTO vinculos_das_destinacoes(id,destinacao_id,categoria) VALUES "
                    "(:id,:destino,'lazer')"
                ),
                {"id": uuid4().hex, "destino": destino},
            )
            for _ in range(transacoes):
                c.execute(
                    text(
                        "INSERT INTO "
                        "transacoes_importadas(id,conta_id,id_externo,data,descricao,"
                        "valor_centavos,sentido,estado) "
                        "VALUES (:id,:conta,:externo,'2026-11-09','Exemplo',100,:sentido,'aceita')"
                    ),
                    {"id": uuid4().hex, "externo": uuid4().hex, "conta": conta, "sentido": sentido},
                )
            for _ in range(lancamentos):
                c.execute(
                    text(
                        "INSERT INTO "
                        "gastos(id,conta_id,data,descricao,valor_centavos,categoria,origem) VALUES "
                        "(:id,:conta,'2026-11-09',:descricao,100,'lazer','open_finance')"
                    ),
                    {"id": uuid4().hex, "conta": conta, "descricao": descricao},
                )
            triggers = c.execute(
                text("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name")
            ).all()
        command.upgrade(cfg, "head")
        assert "vinculos_das_destinacoes" not in inspect(engine).get_table_names()
        with engine.begin() as c:
            with pytest.raises(IntegrityError), c.begin_nested():
                c.execute(
                    text(
                        "UPDATE transacoes_importadas "
                        "SET motivo_ignorada = 'transferencia_entre_contas'"
                    )
                )
            with pytest.raises(IntegrityError), c.begin_nested():
                c.execute(
                    text(
                        "INSERT INTO historico_de_metas "
                        "(id,usuario_id,categoria,acao,percentual_anterior,"
                        "percentual_novo,instante) VALUES "
                        "(:id,:dono,'lazer','alterada',19,19,'2026-11-09')"
                    ),
                    {"id": uuid4().hex, "dono": dono},
                )
            assert (
                c.scalar(
                    text("SELECT count(*) FROM gastos WHERE transacao_importada_id IS NOT NULL")
                )
                == esperado
            )
            assert c.scalar(text("SELECT saldo_centavos FROM contas")) == 12345
            assert c.scalar(text("SELECT percentual FROM metas")) == 19
            assert c.scalar(text("SELECT count(*) FROM historico_de_metas")) == 0
            assert c.scalar(text("PRAGMA integrity_check")) == "ok"
            assert c.execute(text("PRAGMA foreign_key_check")).all() == []
            assert (
                c.execute(
                    text("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name")
                ).all()
                == triggers
            )
            modulo = run_path(
                str(
                    Path(__file__).resolve().parents[2]
                    / "migrations/versions/a05600000004_religa_lancamentos_as_transacoes.py"
                )
            )
            with Operations.context(MigrationContext.configure(c)):
                modulo["upgrade"]()
            assert (
                c.scalar(
                    text("SELECT count(*) FROM gastos WHERE transacao_importada_id IS NOT NULL")
                )
                == esperado
            )
        command.downgrade(cfg, "f70b1594d23e")
        with engine.connect() as c:
            assert c.scalar(text("SELECT count(*) FROM vinculos_das_destinacoes")) == 0
            assert (
                c.scalar(
                    text("SELECT count(*) FROM gastos WHERE transacao_importada_id IS NOT NULL")
                )
                == esperado
            )
    finally:
        engine.dispose()
        obter_configuracoes.cache_clear()
