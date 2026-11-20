"""069 (T033): no banco populado, a outra pessoa nunca vê nem alcança nada da dona."""

import re
from datetime import date

import pytest
from fastapi.testclient import TestClient

from dados_de_teste.popular import (
    EMAIL_DA_DONA,
    EMAIL_DA_OUTRA_PESSOA,
    SENHA_DE_TESTE,
    popular,
)
from gastoba.api.app import criar_app
from gastoba.infrastructure.configuracoes import Configuracoes

HOJE = date(2026, 11, 15)
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
PARAMETROS = {
    "inicio": "2026-01-01",
    "fim": "2026-12-31",
    "mes": "2026-11",
    "hoje": "2026-11-15",
    "visao": "destinacao",
}


@pytest.fixture(scope="module")
def cliente(tmp_path_factory):
    url = f"sqlite:///{tmp_path_factory.mktemp('isolamento')}/teste.db"
    popular(url, HOJE, ambiente={"GASTOBA_AMBIENTE_DE_TESTE": "true"})
    configuracoes = Configuracoes(
        url_banco=url,
        origens_permitidas=["http://localhost:5173"],
        hosts_permitidos=["localhost", "127.0.0.1"],
        cadastro_aberto=False,
        cookie_seguro=False,
        intervalo_de_recorrencias_minutos=0,
        tentativas_de_login=50,
    )
    with TestClient(criar_app(configuracoes), base_url="http://localhost") as c:
        yield c


def _entrar(cliente, email):
    resposta = cliente.post("/auth/entrar", json={"email": email, "senha": SENHA_DE_TESTE})
    assert resposta.status_code == 200
    cliente.cookies.clear()
    return {"Authorization": f"Bearer {resposta.json()['token']}"}


def _rotas_get(cliente):
    caminhos = cliente.app.openapi()["paths"]
    return sorted(c for c, metodos in caminhos.items() if "get" in metodos and c != "/health")


def _ids(corpo) -> set[str]:
    return set(UUID.findall(str(corpo)))


def test_nenhuma_rota_get_da_outra_pessoa_devolve_id_da_dona_e_todo_id_da_dona_e_404(cliente):
    dona = _entrar(cliente, EMAIL_DA_DONA)
    outra = _entrar(cliente, EMAIL_DA_OUTRA_PESSOA)
    ids_da_dona: set[str] = set()
    sem_parametro = [c for c in _rotas_get(cliente) if "{" not in c]
    for caminho in sem_parametro:
        resposta = cliente.get(caminho, params=PARAMETROS, headers=dona)
        if resposta.status_code == 200:
            ids_da_dona |= _ids(resposta.json())
    ids_da_outra: set[str] = set()
    vistas_pela_outra: set[str] = set()
    for caminho in sem_parametro:
        resposta = cliente.get(caminho, params=PARAMETROS, headers=outra)
        if resposta.status_code == 200:
            vistas_pela_outra |= _ids(resposta.json())
    me = cliente.get("/auth/eu", headers=outra).json()["id"]
    ids_da_outra |= {me}
    ids_da_dona -= ids_da_outra
    assert len(ids_da_dona) > 50, "a dona precisa ter dados para o teste valer"
    assert not (vistas_pela_outra & ids_da_dona)
    # Todo id da dona, em toda rota GET com um só parâmetro de caminho, é inexistente para a outra.
    com_parametro = [c for c in _rotas_get(cliente) if c.count("{") == 1]
    for caminho in com_parametro:
        for um_id in list(ids_da_dona)[:15]:
            url = re.sub(r"\{[^}]+\}", um_id, caminho)
            status = cliente.get(url, params=PARAMETROS, headers=outra).status_code
            assert status in (403, 404, 422), f"{caminho} respondeu {status}"
