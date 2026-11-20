from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from gastoba.infrastructure.configuracoes import obter_configuracoes

ANTERIOR = "e66000000001"
NOVA = "f71000000001"
USUARIO = "00000000000000000000000000000001"
CONTA = "00000000000000000000000000000002"


def _config(monkeypatch, url):
    monkeypatch.setenv("GASTOBA_URL_BANCO", url)
    obter_configuracoes.cache_clear()
    config = Config()
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[2] / "migrations")
    )
    return config


def _semear(c):
    c.execute(text(f"INSERT INTO usuarios(id,nome) VALUES ('{USUARIO}','Pessoa')"))
    c.execute(
        text(
            "INSERT INTO contas(id,usuario_id,nome,saldo_centavos,origem,tipo,id_externo) "
            f"VALUES ('{CONTA}','{USUARIO}','Conta',0,'open_finance','corrente','x')"
        )
    )
    for i, (estado, motivo) in enumerate(
        [("pendente", None), ("ignorada", "transferencia_entre_contas")], start=1
    ):
        c.execute(
            text(
                "INSERT INTO transacoes_importadas(id,conta_id,id_externo,data,descricao,"
                "valor_centavos,sentido,estado,motivo_ignorada) "
                f"VALUES ('{i:032d}','{CONTA}','e{i}','2026-10-01','d',100,'saida',"
                f"'{estado}',{'NULL' if motivo is None else repr(motivo)})"
            )
        )


def _inserir_com_motivo(c, motivo):
    c.execute(
        text(
            "INSERT INTO transacoes_importadas(id,conta_id,id_externo,data,descricao,"
            "valor_centavos,sentido,estado,motivo_ignorada) "
            f"VALUES ('{99:032d}','{CONTA}','novo','2026-10-01','d',100,'saida','ignorada',"
            f"'{motivo}')"
        )
    )


def _gatilhos(c):
    return {
        linha[0]
        for linha in c.execute(
            text(
                "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'integridade_%'"
            )
        )
    }


def test_troca_o_check_preservando_dados_gatilhos_e_visao(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/m.db"
    config = _config(monkeypatch, url)
    engine = create_engine(url)
    try:
        command.upgrade(config, ANTERIOR)
        with engine.begin() as c:
            _semear(c)
            antes = _gatilhos(c)
            with pytest.raises(IntegrityError):
                _inserir_com_motivo(c, "movimento_interno_da_conta")
        command.upgrade(config, NOVA)
        with engine.begin() as c:
            assert _gatilhos(c) == antes
            assert c.execute(text("SELECT count(*) FROM pontas_de_transferencias")).scalar() == 0
            assert c.execute(text("SELECT count(*) FROM transacoes_importadas")).scalar() == 2
            _inserir_com_motivo(c, "movimento_interno_da_conta")
            with pytest.raises(IntegrityError):
                _inserir_com_motivo(c, "outro")
    finally:
        engine.dispose()


def test_downgrade_recusa_com_o_motivo_novo_e_volta_sem_ele(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/m.db"
    config = _config(monkeypatch, url)
    engine = create_engine(url)
    try:
        command.upgrade(config, NOVA)
        with engine.begin() as c:
            _semear(c)
            antes = _gatilhos(c)
            _inserir_com_motivo(c, "movimento_interno_da_conta")
        with pytest.raises(RuntimeError, match="movimento interno"):
            command.downgrade(config, ANTERIOR)
        with engine.begin() as c:
            assert c.execute(text("SELECT count(*) FROM transacoes_importadas")).scalar() == 3
            c.execute(text(f"DELETE FROM transacoes_importadas WHERE id='{99:032d}'"))
        command.downgrade(config, ANTERIOR)
        with engine.begin() as c:
            assert _gatilhos(c) == antes
            with pytest.raises(IntegrityError):
                _inserir_com_motivo(c, "movimento_interno_da_conta")
    finally:
        engine.dispose()
