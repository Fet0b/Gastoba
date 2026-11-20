"""A documentação da API (`/openapi.json`, `/docs`, `/redoc`) exige credencial (spec 075)."""

from datetime import timedelta

import pytest

ROTAS = ["/openapi.json", "/docs", "/redoc"]


@pytest.mark.parametrize("caminho", ROTAS)
def test_sem_credencial_devolve_401(cliente, caminho):
    resposta = cliente.get(caminho)

    assert resposta.status_code == 401
    assert resposta.headers["www-authenticate"] == "Bearer"
    assert resposta.json()["erro"]["codigo"] == "nao_autenticado"


@pytest.mark.parametrize("caminho", ROTAS)
def test_token_invalido_devolve_401(cliente, caminho):
    resposta = cliente.get(caminho, headers={"Authorization": "Bearer gsess_invalido"})

    assert resposta.status_code == 401
    assert resposta.json()["erro"]["codigo"] == "nao_autenticado"


@pytest.mark.parametrize("caminho", ROTAS)
def test_sessao_expirada_devolve_401(cliente, autenticar, caminho):
    cabecalhos = autenticar()
    cliente.app.state.relogio = _RelogioAdiantado(cliente.app.state.relogio, timedelta(hours=13))

    resposta = cliente.get(caminho, headers=cabecalhos)

    assert resposta.status_code == 401
    assert resposta.json()["erro"]["codigo"] == "nao_autenticado"


class _RelogioAdiantado:
    def __init__(self, relogio, adiantamento):
        self._relogio = relogio
        self._adiantamento = adiantamento

    def agora(self):
        return self._relogio.agora() + self._adiantamento


def test_openapi_com_sessao_devolve_o_contrato(cliente_autenticado):
    resposta = cliente_autenticado.get("/openapi.json")

    assert resposta.status_code == 200
    assert resposta.headers["content-type"].startswith("application/json")
    caminhos = resposta.json()["paths"]
    assert "/health" in caminhos
    for caminho in ROTAS:
        assert caminho not in caminhos


def test_openapi_com_chave_de_leitura_devolve_o_contrato(cliente, autenticar):
    sessao = autenticar()
    chave = cliente.post(
        "/chaves-de-api", json={"nome": "docs", "escopo": "leitura"}, headers=sessao
    ).json()["segredo"]

    resposta = cliente.get("/openapi.json", headers={"Authorization": f"Bearer {chave}"})

    assert resposta.status_code == 200


@pytest.mark.parametrize("caminho", ["/docs", "/redoc"])
def test_paginas_html_leem_o_contrato_por_endereco_relativo(cliente_autenticado, caminho):
    resposta = cliente_autenticado.get(caminho)

    assert resposta.status_code == 200
    assert resposta.headers["content-type"].startswith("text/html")
    assert "openapi.json" in resposta.text
    assert "/openapi.json" not in resposta.text
