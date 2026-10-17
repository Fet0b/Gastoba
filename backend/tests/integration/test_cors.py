import pytest

from gastoba.api.app import criar_app

ORIGEM_PERMITIDA = "http://localhost:5173"
ORIGEM_NAO_PERMITIDA = "http://malicioso.example"


def test_preflight_de_origem_permitida_e_aceito(cliente):
    resposta = cliente.options(
        "/health",
        headers={"Origin": ORIGEM_PERMITIDA, "Access-Control-Request-Method": "GET"},
    )

    assert resposta.status_code == 200
    assert resposta.headers["access-control-allow-origin"] == ORIGEM_PERMITIDA


def test_preflight_de_origem_nao_permitida_nao_libera_a_origem(cliente):
    resposta = cliente.options(
        "/health",
        headers={"Origin": ORIGEM_NAO_PERMITIDA, "Access-Control-Request-Method": "GET"},
    )

    assert resposta.headers.get("access-control-allow-origin") != ORIGEM_NAO_PERMITIDA


def test_preflight_libera_credenciais_e_os_cabecalhos_da_autenticacao(cliente):
    resposta = cliente.options(
        "/contas",
        headers={
            "Origin": ORIGEM_PERMITIDA,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization, content-type, x-gastoba-requisicao",
        },
    )

    assert resposta.status_code == 200
    assert resposta.headers["access-control-allow-origin"] == ORIGEM_PERMITIDA
    assert resposta.headers["access-control-allow-credentials"] == "true"
    liberados = {
        cabecalho.strip().lower()
        for cabecalho in resposta.headers["access-control-allow-headers"].split(",")
    }
    assert {"authorization", "content-type", "x-gastoba-requisicao"} <= liberados


def test_preflight_recusa_cabecalho_nao_liberado(cliente):
    resposta = cliente.options(
        "/contas",
        headers={
            "Origin": ORIGEM_PERMITIDA,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-outro-cabecalho",
        },
    )

    assert resposta.status_code == 400


def test_preflight_de_origem_nao_permitida_nao_libera_credenciais(cliente):
    resposta = cliente.options(
        "/contas",
        headers={
            "Origin": ORIGEM_NAO_PERMITIDA,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-gastoba-requisicao",
        },
    )

    assert resposta.headers.get("access-control-allow-origin") != ORIGEM_NAO_PERMITIDA
    assert resposta.status_code == 400


@pytest.mark.parametrize("campo", ["origens_permitidas", "hosts_permitidos"])
def test_asterisco_nas_origens_ou_hosts_e_recusado(configuracoes_teste, campo):
    configuracoes = configuracoes_teste.model_copy(update={campo: ["*"]})

    with pytest.raises(ValueError):
        criar_app(configuracoes)


def test_resposta_expoe_retry_after_e_www_authenticate_ao_javascript(cliente):
    # Fora da lista segura do CORS, a SPA não leria esses cabeçalhos sem a exposição.
    resposta = cliente.get("/contas", headers={"Origin": ORIGEM_PERMITIDA})

    assert resposta.status_code == 401
    expostos = {
        cabecalho.strip().lower()
        for cabecalho in resposta.headers["access-control-expose-headers"].split(",")
    }
    assert {"retry-after", "www-authenticate"} <= expostos


def test_requisicao_simples_de_origem_permitida_recebe_cabecalho_cors(cliente):
    resposta = cliente.get("/health", headers={"Origin": ORIGEM_PERMITIDA})

    assert resposta.status_code == 200
    assert resposta.headers.get("access-control-allow-origin") == ORIGEM_PERMITIDA


@pytest.mark.parametrize("metodo", ["GET", "POST", "PUT", "DELETE"])
def test_preflight_libera_os_metodos_da_api_incluindo_put(cliente, metodo):
    resposta = cliente.options(
        "/metas/lazer",
        headers={"Origin": ORIGEM_PERMITIDA, "Access-Control-Request-Method": metodo},
    )

    assert resposta.status_code == 200
    liberados = {m.strip() for m in resposta.headers["access-control-allow-methods"].split(",")}
    assert metodo in liberados


def test_preflight_recusa_metodo_nao_liberado(cliente):
    resposta = cliente.options(
        "/metas/lazer",
        headers={"Origin": ORIGEM_PERMITIDA, "Access-Control-Request-Method": "PATCH"},
    )

    assert resposta.status_code == 400
