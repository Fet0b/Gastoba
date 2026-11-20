from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from gastoba.infrastructure.configuracoes import obter_configuracoes


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


def test_migracao_marca_pendencias_sem_reescrever_financas(url_banco, config):
    engine = create_engine(url_banco)
    try:
        command.upgrade(config, "8c3d9e1a6b20")
        with engine.begin() as c:
            c.execute(text("INSERT INTO usuarios(id,nome) VALUES('u','Pessoa fictícia')"))
            c.execute(
                text(
                    "INSERT INTO contas(id,usuario_id,nome,saldo_centavos,origem,tipo) "
                    "VALUES('c','u','Carteira exemplo',90000,'manual','corrente')"
                )
            )
            c.execute(
                text(
                    "INSERT INTO "
                    "investimentos(id,usuario_id,id_externo,nome,tipo,saldo_centa"
                    "vos,dados) VALUES('i','u','exemplo','Reserva exemplo','FIXED"
                    "_INCOME',60000,'{}')"
                )
            )
            for id_, tipo, origem, conta in [
                ("a", "aporte", "manual", "c"),
                ("r", "resgate", "open_finance", "c"),
                ("s", "aporte", "saldo_inicial", None),
            ]:
                c.execute(
                    text(
                        "INSERT INTO "
                        "movimentos_de_investimento(id,conta_id,investimento_id,tipo,"
                        "descricao,valor_centavos,data,origem) VALUES(:id,:conta,'i',"
                        ":tipo,'Exemplo',7000,'2026-10-10',:origem)"
                    ),
                    dict(id=id_, conta=conta, tipo=tipo, origem=origem),
                )
            c.execute(
                text(
                    "INSERT INTO metas(id,usuario_id,categoria,percentual) VALUES"
                    "('m','u','investimentos',10)"
                )
            )
            c.execute(
                text(
                    "INSERT INTO "
                    "gastos(id,conta_id,descricao,valor_centavos,data,categoria,t"
                    "ags,origem) VALUES('g','c','Compra exemplo',2000,'2026-10-10"
                    "','investimentos','[]','manual')"
                )
            )
            tabelas = ["movimentos_de_investimento", "gastos", "contas", "investimentos"]
            antes = {
                t: c.execute(text(f"SELECT * FROM {t} ORDER BY id")).mappings().all()
                for t in tabelas
            }
        command.upgrade(config, "9f4b2c7d6a10")
        with engine.connect() as c:
            for tabela in tabelas:
                depois = [
                    dict(r)
                    for r in c.execute(text(f"SELECT * FROM {tabela} ORDER BY id")).mappings()
                ]
                if tabela == "movimentos_de_investimento":
                    assert {r["id"]: r.pop("revisao_pendente") for r in depois} == {
                        "a": 1,
                        "r": 0,
                        "s": 0,
                    }
                    assert all(r.pop("categoria") is None for r in depois)
                assert depois == antes[tabela]
            assert (
                c.execute(text("SELECT categoria FROM metas")).scalar_one()
                == "liberdade_financeira"
            )
        inspetor = inspect(engine)
        # Esta verificação é da migration de revisão, antes das normalizações posteriores.
        assert {"id", "gasto_id", "tag", "valor_centavos"} <= {
            c["name"] for c in inspetor.get_columns("coberturas_de_compra")
        }
        assert any(
            u["column_names"] == ["gasto_id", "tag"]
            for u in inspetor.get_unique_constraints("coberturas_de_compra")
        )
        command.downgrade(config, "8c3d9e1a6b20")
        assert "categoria" not in {
            c["name"] for c in inspect(engine).get_columns("movimentos_de_investimento")
        }
        with engine.connect() as c:
            assert c.execute(text("SELECT categoria FROM metas")).scalar_one() == "investimentos"
        command.upgrade(config, "head")
    finally:
        engine.dispose()
