"""069 (T035): descer algumas revisões e subir de novo no banco populado não perde lançamentos."""

import os
import shutil
import sqlite3
from datetime import date

import pytest
from alembic import command
from alembic.config import Config

from dados_de_teste.consistencia import revisar
from dados_de_teste.popular import RAIZ_DO_BACKEND, popular
from gastoba.infrastructure.configuracoes import obter_configuracoes

HOJE = date(2026, 11, 15)
SOMAS = (
    "SELECT COUNT(*), COALESCE(SUM(valor_centavos), 0) FROM gastos",
    "SELECT COUNT(*), COALESCE(SUM(valor_centavos), 0) FROM ganhos",
    "SELECT COUNT(*), COALESCE(SUM(valor_centavos), 0) FROM movimentos_de_investimento",
)


@pytest.fixture(scope="module")
def populado(tmp_path_factory):
    pasta = tmp_path_factory.mktemp("migracoes")
    popular(f"sqlite:///{pasta}/teste.db", HOJE, ambiente={"GASTOBA_AMBIENTE_DE_TESTE": "true"})
    return pasta / "teste.db"


def _somas(arquivo) -> list[tuple]:
    conexao = sqlite3.connect(arquivo)
    try:
        return [conexao.execute(sql).fetchone() for sql in SOMAS]
    finally:
        conexao.close()


def _alembic(url, comando, destino):
    anterior = os.environ.get("GASTOBA_URL_BANCO")
    os.environ["GASTOBA_URL_BANCO"] = url
    obter_configuracoes.cache_clear()
    try:
        configuracao = Config()
        configuracao.set_main_option("script_location", str(RAIZ_DO_BACKEND / "migrations"))
        comando(configuracao, destino)
    finally:
        if anterior is None:
            os.environ.pop("GASTOBA_URL_BANCO", None)
        else:
            os.environ["GASTOBA_URL_BANCO"] = anterior
        obter_configuracoes.cache_clear()


@pytest.mark.parametrize("passos", [1, 2])
def test_descer_e_subir_mantem_as_somas_e_a_revisao_limpa(passos, populado, tmp_path):
    copia = tmp_path / "copia.db"
    shutil.copy(populado, copia)
    url = f"sqlite:///{copia}"
    antes = _somas(copia)
    # 071: o downgrade do motivo recusa descer com movimento interno da conta gravado (perderia a
    # informação); aqui o banco populado o tem de propósito, então o motivo sai da cópia antes.
    conexao = sqlite3.connect(copia)
    conexao.execute(
        "UPDATE transacoes_importadas SET motivo_ignorada = NULL "
        "WHERE motivo_ignorada = 'movimento_interno_da_conta'"
    )
    conexao.commit()
    conexao.close()
    _alembic(url, command.downgrade, f"-{passos}")
    _alembic(url, command.upgrade, "head")
    assert _somas(copia) == antes
    assert [r.nome for r in revisar(url) if r.reprova] == []
