"""069 (T034): o cenário popula e a revisão passa em dias de borda do calendário."""

from datetime import date, timedelta

import pytest

from dados_de_teste.consistencia import revisar
from dados_de_teste.popular import _Roteiro, popular
from gastoba.infrastructure.persistencia.banco import criar_engine

AMBIENTE = {"GASTOBA_AMBIENTE_DE_TESTE": "true"}
DIAS = [
    date(2026, 11, 1),
    date(2026, 11, 5),
    date(2026, 11, 10),
    date(2026, 12, 31),
    date(2028, 2, 29),
    date(2028, 3, 1),
]


@pytest.mark.parametrize("hoje", DIAS, ids=lambda d: d.isoformat())
def test_popular_e_revisar_em_dia_de_borda(hoje, tmp_path):
    url = f"sqlite:///{tmp_path}/teste.db"
    popular(url, hoje, ambiente=AMBIENTE)
    resultados = revisar(url)
    assert [r.nome for r in resultados if r.reprova] == []


@pytest.mark.parametrize("dias", [1, 30])
def test_ressincronizar_depois_nao_cria_nem_muda_nada(dias, tmp_path):
    hoje = date(2026, 11, 15)
    url = f"sqlite:///{tmp_path}/teste.db"
    popular(url, hoje, ambiente=AMBIENTE)
    engine = criar_engine(url)
    try:
        depois = _Roteiro(engine, hoje + timedelta(days=dias))
        antes = _estado(url)
        resultado = depois.sincronizador().executar()
        assert resultado.falhas == 0
        # As transações antigas continuam as mesmas; só podem chegar as que o cenário deslocou
        # para a nova data (o cenário anda com "hoje"): nada do que existia muda de estado.
        assert _estado(url, so=antes.keys()) == antes
    finally:
        engine.dispose()


def _estado(url, so=None) -> dict[str, str]:
    import sqlite3

    conexao = sqlite3.connect(url.removeprefix("sqlite:///"))
    try:
        linhas = conexao.execute("SELECT id, estado FROM transacoes_importadas").fetchall()
    finally:
        conexao.close()
    return {i: e for i, e in linhas if so is None or i in so}
