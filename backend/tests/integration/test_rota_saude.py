from fastapi.testclient import TestClient

from gastoba.api.app import criar_app
from gastoba.infrastructure.configuracoes import Configuracoes


def test_saude_com_banco_disponivel_responde_200(cliente):
    resposta = cliente.get("/health")

    assert resposta.status_code == 200
    assert resposta.json() == {"status": "ok", "banco": "ok"}


def test_saude_com_banco_inacessivel_responde_503_sem_detalhes(tmp_path):
    configuracoes = Configuracoes(
        url_banco=f"sqlite:///{tmp_path}/nao_existe/x.db",
        origens_permitidas=["http://localhost:5173"],
    )

    with TestClient(criar_app(configuracoes), base_url="http://localhost") as cliente:
        resposta = cliente.get("/health")

    assert resposta.status_code == 503
    assert resposta.json() == {"status": "indisponivel", "banco": "indisponivel"}


def test_documentacao_interativa_disponivel(cliente):
    resposta = cliente.get("/docs")

    assert resposta.status_code == 200


def test_especificacao_openapi_contem_rota_de_saude(cliente):
    resposta = cliente.get("/openapi.json")

    assert resposta.status_code == 200
    assert "/health" in resposta.json()["paths"]
