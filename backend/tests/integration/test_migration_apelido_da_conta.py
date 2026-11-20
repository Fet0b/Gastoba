from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from gastoba.infrastructure.configuracoes import obter_configuracoes

ANTERIOR = "f71000000001"
NOVA = "f68000000001"
USUARIO = "00000000000000000000000000000001"
OUTRO = "00000000000000000000000000000009"


def _config(monkeypatch, url):
    monkeypatch.setenv("GASTOBA_URL_BANCO", url)
    obter_configuracoes.cache_clear()
    config = Config()
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[2] / "migrations")
    )
    return config


def _objetos(c):
    return {
        linha
        for linha in c.execute(
            text("SELECT type, name FROM sqlite_master WHERE type IN ('trigger', 'view')")
        )
    }


def _conta(c, id_, usuario, nome):
    c.execute(
        text(
            "INSERT INTO contas(id,usuario_id,nome,saldo_centavos,origem,tipo) "
            f"VALUES ('{id_:032d}','{usuario}','{nome}',100,'manual','corrente')"
        )
    )


def test_upgrade_so_acrescenta_preserva_dados_gatilhos_e_visao_e_downgrade_volta(
    tmp_path, monkeypatch
):
    url = f"sqlite:///{tmp_path}/m.db"
    config = _config(monkeypatch, url)
    engine = create_engine(url)
    try:
        command.upgrade(config, ANTERIOR)
        with engine.begin() as c:
            c.execute(text(f"INSERT INTO usuarios(id,nome) VALUES ('{USUARIO}','Pessoa')"))
            c.execute(text(f"INSERT INTO usuarios(id,nome) VALUES ('{OUTRO}','Outra')"))
            _conta(c, 2, USUARIO, "Antiga")
            antes = _objetos(c)
            colunas_antes = {r[1] for r in c.execute(text("PRAGMA table_info(contas)"))}

        command.upgrade(config, NOVA)

        with engine.begin() as c:
            colunas = {r[1] for r in c.execute(text("PRAGMA table_info(contas)"))}
            assert colunas - colunas_antes == {"apelido", "nome_no_banco", "final_do_numero"}
            assert _objetos(c) == antes
            linha = c.execute(
                text(
                    "SELECT nome, saldo_centavos, apelido, nome_no_banco, "
                    "final_do_numero FROM contas"
                )
            ).one()
            assert tuple(linha) == ("Antiga", 100, None, None, None)
            _conta(c, 3, USUARIO, "Outra conta")  # NULLs não colidem
            c.execute(text("UPDATE contas SET apelido='Casa' WHERE id=:i"), {"i": f"{2:032d}"})
            _conta(c, 4, OUTRO, "Sua")
            c.execute(text("UPDATE contas SET apelido='Casa' WHERE id=:i"), {"i": f"{4:032d}"})
        with pytest.raises(IntegrityError), engine.begin() as c:
            c.execute(text("UPDATE contas SET apelido='Casa' WHERE id=:i"), {"i": f"{3:032d}"})
        for coluna, valor in [("apelido", "  "), ("final_do_numero", "123")]:
            with pytest.raises(IntegrityError), engine.begin() as c:
                c.execute(
                    text(f"UPDATE contas SET {coluna}=:v WHERE id=:i"),
                    {"v": valor, "i": f"{3:032d}"},
                )

        command.downgrade(config, ANTERIOR)

        with engine.begin() as c:
            assert {r[1] for r in c.execute(text("PRAGMA table_info(contas)"))} == colunas_antes
            assert _objetos(c) == antes
            assert c.execute(text("SELECT count(*) FROM contas")).scalar() == 3
            assert c.execute(text("PRAGMA integrity_check")).scalar() == "ok"
    finally:
        engine.dispose()
