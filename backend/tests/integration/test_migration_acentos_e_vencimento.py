from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from gastoba.infrastructure.configuracoes import obter_configuracoes


@pytest.mark.parametrize("conflito", [False, True])
def test_acentos_preservam_ids_e_recusam_colisao_antes_de_escrever(tmp_path, monkeypatch, conflito):
    url = f"sqlite:///{tmp_path}/acentos.db"
    monkeypatch.setenv("GASTOBA_URL_BANCO", url)
    obter_configuracoes.cache_clear()
    config = Config()
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[2] / "migrations")
    )
    engine = create_engine(url)
    try:
        command.upgrade(config, "a05800000001")
        with engine.begin() as c:
            c.execute(
                text(
                    "INSERT INTO usuarios(id,nome) "
                    "VALUES ('00000000000000000000000000000001','Pessoa')"
                )
            )
            for id_, nome in [("a", "patrimonio"), ("b", "reserva de emergencia")] + (
                [("c", "reserva de emergência")] if conflito else []
            ):
                c.execute(
                    text(
                        "INSERT INTO destinacoes_cadastradas(id,usuario_id,nome) "
                        "VALUES (:id,'00000000000000000000000000000001',:nome)"
                    ),
                    {"id": id_, "nome": nome},
                )
        if conflito:
            with pytest.raises(RuntimeError, match="nomes equivalentes"):
                command.upgrade(config, "a05800000002")
            with engine.connect() as c:
                assert (
                    c.execute(
                        text("SELECT nome FROM destinacoes_cadastradas WHERE id='a'")
                    ).scalar()
                    == "patrimonio"
                )
        else:
            command.upgrade(config, "a05800000003")
            with engine.connect() as c:
                assert c.execute(
                    text("SELECT id,nome FROM destinacoes_cadastradas ORDER BY id")
                ).all() == [("a", "patrimônio"), ("b", "reserva de emergência")]
            assert "vencimento_confirmado" in {
                c["name"] for c in inspect(engine).get_columns("movimentos_de_investimento")
            }
            command.downgrade(config, "a05800000001")
            assert "vencimento_confirmado" not in {
                c["name"] for c in inspect(engine).get_columns("movimentos_de_investimento")
            }
            with engine.connect() as c:
                assert (
                    c.execute(
                        text("SELECT nome FROM destinacoes_cadastradas WHERE id='a'")
                    ).scalar()
                    == "patrimônio"
                )
    finally:
        engine.dispose()
        obter_configuracoes.cache_clear()
