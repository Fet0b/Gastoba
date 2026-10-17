"""Toda rota fora da lista pública exige credencial; formatos de credencial recusados."""

from uuid import uuid4

import pytest

from gastoba.domain.segredo_de_acesso import TAMANHO_MAXIMO_DO_SEGREDO

ROTAS_PUBLICAS = {
    ("GET", "/health"),
    ("POST", "/auth/cadastro"),
    ("POST", "/auth/entrar"),
}

ROTAS_DE_NEGOCIO = [
    ("GET", "/contas"),
    ("POST", "/contas"),
    ("GET", "/gastos?inicio=2026-10-01&fim=2026-10-31"),
    ("POST", "/gastos"),
    ("GET", "/ganhos?inicio=2026-10-01&fim=2026-10-31"),
    ("POST", "/ganhos"),
    ("DELETE", f"/ganhos/{uuid4()}"),
    ("GET", "/recorrencias"),
    ("POST", "/recorrencias"),
    ("PUT", f"/recorrencias/{uuid4()}"),
    ("DELETE", f"/recorrencias/{uuid4()}"),
    ("GET", "/metas"),
    ("GET", "/metas/progresso?mes=2026-10"),
    ("PUT", "/metas/lazer"),
    ("DELETE", "/metas/lazer"),
    ("GET", "/resumos/tags?inicio=2026-10-01&fim=2026-10-31"),
    ("GET", "/transacoes-importadas"),
    ("POST", f"/transacoes-importadas/{uuid4()}/aceitar"),
    ("POST", f"/transacoes-importadas/{uuid4()}/ignorar"),
    ("POST", "/sincronizacoes"),
    ("GET", "/tags"),
    ("GET", "/categorias"),
    ("GET", "/auth/eu"),
    ("POST", "/auth/sair"),
    ("GET", "/chaves-de-api"),
    ("POST", "/chaves-de-api"),
    ("DELETE", f"/chaves-de-api/{uuid4()}"),
]

MENSAGEM_DE_NAO_AUTENTICADO = "Credencial ausente, inválida ou expirada."


def _operacoes(cliente) -> dict[tuple[str, str], dict]:
    """Rotas publicadas no contrato OpenAPI: (método, caminho) → operação."""
    caminhos = cliente.get("/openapi.json").json()["paths"]
    return {
        (metodo.upper(), caminho): operacao
        for caminho, operacoes in caminhos.items()
        for metodo, operacao in operacoes.items()
    }


def _confere_401(resposta) -> None:
    assert resposta.status_code == 401
    assert resposta.headers["www-authenticate"] == "Bearer"
    assert resposta.json() == {
        "erro": {"codigo": "nao_autenticado", "mensagem": MENSAGEM_DE_NAO_AUTENTICADO}
    }


def test_lista_de_rotas_de_negocio_cobre_todas_as_rotas_nao_publicas(cliente):
    cobertas = {(metodo, caminho.split("?")[0]) for metodo, caminho in ROTAS_DE_NEGOCIO}
    parametrizadas = {
        "/transacoes-importadas/": None,  # tratado à parte (duas rotas com sufixos diferentes)
        "/chaves-de-api/": "/chaves-de-api/{chave_id}",
        "/ganhos/": "/ganhos/{ganho_id}",
        "/recorrencias/": "/recorrencias/{recorrencia_id}",
        "/metas/lazer": "/metas/{categoria}",
    }

    def _normalizar(caminho: str) -> str:
        if caminho.startswith("/transacoes-importadas/"):
            sufixo = caminho.rsplit("/", 1)[-1]
            return f"/transacoes-importadas/{{transacao_id}}/{sufixo}"
        for prefixo, modelo in parametrizadas.items():
            if modelo is not None and caminho.startswith(prefixo):
                return modelo
        return caminho

    cobertas = {(metodo, _normalizar(caminho)) for metodo, caminho in cobertas}

    assert set(_operacoes(cliente)) - ROTAS_PUBLICAS == cobertas


@pytest.mark.parametrize(("metodo", "caminho"), ROTAS_DE_NEGOCIO)
def test_rota_de_negocio_sem_credencial_devolve_401(cliente, metodo, caminho):
    resposta = cliente.request(metodo, caminho, json={})

    _confere_401(resposta)


def test_health_continua_aberto(cliente):
    resposta = cliente.get("/health")

    assert resposta.status_code == 200


@pytest.mark.parametrize(
    "autorizacao",
    [
        "Basic YW5hQHguY29tOnNlbmhh",
        "Bearer",
        "Bearer ",
        "Token gsess_" + "a" * 43,
        "gsess_" + "a" * 43,
        "Bearer qualquer-coisa",
        "Bearer gsess_curto",
        "Bearer gxyz_" + "a" * 43,
        "Bearer gsess_" + "a" * 43,
        "Bearer gapi_Ab12Cd34_" + "a" * 43,
    ],
)
def test_credencial_malformada_desconhecida_ou_de_outro_esquema_devolve_401(cliente, autorizacao):
    resposta = cliente.get("/contas", headers={"Authorization": autorizacao})

    _confere_401(resposta)


def test_token_acima_do_tamanho_maximo_devolve_401_sem_calcular_hash(cliente, monkeypatch):
    import gastoba.domain.segredo_de_acesso as modulo

    def _proibido(*_args, **_kwargs):
        raise AssertionError("não deveria calcular hash")

    monkeypatch.setattr(modulo.hashlib, "sha256", _proibido)
    token = "gsess_" + "a" * TAMANHO_MAXIMO_DO_SEGREDO

    resposta = cliente.get("/contas", headers={"Authorization": f"Bearer {token}"})

    _confere_401(resposta)


def test_esquema_bearer_aceita_qualquer_caixa(cliente, autenticar):
    token = autenticar()["Authorization"].removeprefix("Bearer ")

    resposta = cliente.get("/contas", headers={"Authorization": f"bearer {token}"})

    assert resposta.status_code == 200


def test_cookie_com_chave_de_api_nao_autentica(cliente, autenticar):
    sessao = autenticar()
    chave = cliente.post(
        "/chaves-de-api", json={"nome": "script", "escopo": "leitura"}, headers=sessao
    ).json()["segredo"]

    resposta = cliente.get("/contas", headers={"Cookie": f"gastoba_sessao={chave}"})

    _confere_401(resposta)


def test_toda_rota_publica_um_esquema_de_resposta_de_sucesso(cliente):
    for (metodo, caminho), operacao in _operacoes(cliente).items():
        sucessos = {codigo: r for codigo, r in operacao["responses"].items() if codigo[0] == "2"}
        assert len(sucessos) == 1, (metodo, caminho)
        [(codigo, resposta)] = sucessos.items()
        if codigo == "204":
            assert "content" not in resposta, (metodo, caminho)
        else:
            assert resposta["content"]["application/json"]["schema"], (metodo, caminho)


def test_openapi_publica_as_rotas_de_autenticacao_com_esquemas(cliente):
    esquema = cliente.get("/openapi.json").json()
    caminhos = esquema["paths"]
    componentes = esquema["components"]["schemas"]

    for caminho in ["/auth/cadastro", "/auth/entrar", "/auth/sair", "/auth/eu", "/chaves-de-api"]:
        assert caminho in caminhos
    assert "/chaves-de-api/{chave_id}" in caminhos
    assert set(componentes["SessaoResposta"]["properties"]) == {"token", "expira_em"}
    assert set(componentes["UsuarioResposta"]["properties"]) == {"id", "email", "nome"}
    assert "segredo" not in componentes["ChaveDeApiResposta"]["properties"]
    assert "segredo" in componentes["ChaveDeApiCriadaResposta"]["properties"]
    resposta_do_login = caminhos["/auth/entrar"]["post"]["responses"]["200"]
    assert resposta_do_login["content"]["application/json"]["schema"]["$ref"].endswith(
        "/SessaoResposta"
    )
    assert "429" in caminhos["/auth/entrar"]["post"]["responses"]
    assert "401" in caminhos["/contas"]["get"]["responses"]
