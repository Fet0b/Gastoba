"""069 (T032): os mesmos números, vistos por rotas diferentes, concordam no banco populado."""

from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from dados_de_teste.popular import EMAIL_DA_DONA, SENHA_DE_TESTE, popular
from gastoba.api.app import criar_app
from gastoba.infrastructure.configuracoes import Configuracoes

HOJE = date(2026, 11, 15)
MES = "2026-11"


@pytest.fixture(scope="module")
def sessao(tmp_path_factory):
    url = f"sqlite:///{tmp_path_factory.mktemp('numeros')}/teste.db"
    popular(url, HOJE, ambiente={"GASTOBA_AMBIENTE_DE_TESTE": "true"})
    configuracoes = Configuracoes(
        url_banco=url,
        origens_permitidas=["http://localhost:5173"],
        hosts_permitidos=["localhost", "127.0.0.1"],
        cadastro_aberto=False,
        cookie_seguro=False,
        intervalo_de_recorrencias_minutos=0,
    )
    with TestClient(criar_app(configuracoes), base_url="http://localhost") as cliente:
        entrou = cliente.post(
            "/auth/entrar", json={"email": EMAIL_DA_DONA, "senha": SENHA_DE_TESTE}
        ).json()
        cliente.cookies.clear()
        yield cliente, {"Authorization": f"Bearer {entrou['token']}"}


def _dec(texto) -> Decimal:
    return Decimal(texto)


def test_total_das_tags_e_a_soma_do_gasto_das_metas_de_despesa(sessao):
    cliente, h = sessao
    tags = cliente.get(
        "/resumos/tags", params={"inicio": f"{MES}-01", "fim": f"{MES}-30"}, headers=h
    ).json()
    metas = cliente.get("/metas/progresso", params={"mes": MES}, headers=h).json()["metas"]
    despesas = sum(_dec(m["gasto"]) for m in metas if m["categoria"] != "liberdade_financeira")
    assert _dec(tags["total"]) == despesas


@pytest.mark.parametrize("visao", ["destinacao", "tipo"])
def test_total_do_resumo_de_investimentos_e_a_soma_dos_saldos(sessao, visao):
    cliente, h = sessao
    resumo = cliente.get("/investimentos/resumo", params={"visao": visao}, headers=h).json()
    posicoes = cliente.get("/investimentos", headers=h).json()
    assert _dec(resumo["total"]) == sum(_dec(p["saldo"]) for p in posicoes)
    assert sum(_dec(f["valor"]) for f in resumo["fatias"]) == _dec(resumo["total"])


def test_aportes_do_mes_e_o_gasto_da_liberdade_financeira(sessao):
    cliente, h = sessao
    corpo = cliente.get("/metas/progresso", params={"mes": MES}, headers=h).json()
    liberdade = next(m for m in corpo["metas"] if m["categoria"] == "liberdade_financeira")
    assert _dec(liberdade["gasto"]) == _dec(corpo["aportes_do_mes"])
