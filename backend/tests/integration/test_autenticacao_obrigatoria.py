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
    ("GET", "/casamentos"),
    ("GET", "/reaplicacoes/sugestoes"),
    ("PUT", f"/movimentos-de-investimento/{uuid4()}/natureza-do-resgate"),
    ("PUT", f"/contas/{uuid4()}/papel"),
    ("GET", "/transferencias-entre-contas?inicio=2026-11-01&fim=2026-11-30"),
    ("POST", f"/transferencias-entre-contas/{uuid4()}/completar-par"),
    ("POST", f"/transacoes-importadas/{uuid4()}/aceitar-como-transferencia"),
    ("POST", "/caixinhas"),
    ("PUT", f"/investimentos/{uuid4()}/referencias-da-caixinha/2026-11"),
    ("GET", f"/investimentos/{uuid4()}/reconciliacao?mes=2026-11"),
    ("GET", "/revisao-contabil?inicio=2026-11-01&fim=2026-11-30"),
    ("GET", "/contas"),
    ("POST", "/contas"),
    ("DELETE", f"/contas/{uuid4()}"),
    ("GET", "/gastos?inicio=2026-10-01&fim=2026-10-31"),
    ("POST", "/gastos"),
    ("GET", "/ganhos?inicio=2026-10-01&fim=2026-10-31"),
    ("POST", "/ganhos"),
    ("DELETE", f"/ganhos/{uuid4()}"),
    ("GET", "/recorrencias"),
    ("POST", "/recorrencias"),
    ("PUT", f"/recorrencias/{uuid4()}"),
    ("DELETE", f"/recorrencias/{uuid4()}"),
    ("GET", "/faturas?hoje=2026-11-05"),
    ("GET", f"/faturas/{uuid4()}?hoje=2026-11-05"),
    ("GET", "/renda-base"),
    ("PUT", "/renda-base"),
    ("DELETE", "/renda-base"),
    ("GET", "/metas"),
    ("GET", "/metas/historico"),
    ("GET", f"/investimentos/{uuid4()}/operacoes"),
    ("POST", f"/investimentos/{uuid4()}/operacoes"),
    ("PUT", f"/operacoes/{uuid4()}"),
    ("DELETE", f"/operacoes/{uuid4()}"),
    ("POST", f"/investimentos/{uuid4()}/alocar-sem-caixinha"),
    ("GET", "/aportes-sem-investimento"),
    ("POST", f"/aportes-sem-investimento/{uuid4()}/mesclar"),
    ("POST", f"/aportes-sem-investimento/{uuid4()}/excluir"),
    ("POST", f"/aportes-sem-investimento/{uuid4()}/desfazer"),
    ("DELETE", "/casamentos/00000000-0000-4000-8000-000000000000"),
    ("POST", "/casamentos/00000000-0000-4000-8000-000000000000/refazer"),
    ("GET", "/revisao-da-bolsa"),
    ("POST", "/revisao-da-bolsa/confirmar"),
    ("GET", "/reaplicacoes-de-resgates"),
    ("POST", "/reaplicacoes-de-resgates"),
    ("DELETE", "/reaplicacoes-de-resgates/00000000-0000-4000-8000-000000000000"),
    (
        "GET",
        "/movimentos-de-investimento/00000000-0000-4000-8000-000000000000/resgates-para-reaplicar",
    ),
    ("GET", "/metas/alvos"),
    ("GET", "/metas/progresso?mes=2026-10"),
    ("PUT", "/metas/lazer"),
    ("DELETE", "/metas/lazer"),
    ("GET", "/resumos/tags?inicio=2026-10-01&fim=2026-10-31"),
    ("GET", "/transacoes-importadas"),
    ("GET", f"/transacoes-importadas/{uuid4()}/impacto-da-reversao"),
    ("POST", f"/transacoes-importadas/{uuid4()}/desfazer-classificacao"),
    ("POST", f"/transacoes-importadas/{uuid4()}/reclassificar"),
    ("POST", f"/transacoes-importadas/{uuid4()}/aceitar"),
    ("POST", f"/transacoes-importadas/{uuid4()}/ignorar"),
    ("POST", f"/transacoes-importadas/{uuid4()}/aceitar-como-transferencia"),
    ("POST", f"/transacoes-importadas/{uuid4()}/restaurar"),
    ("POST", "/transacoes-importadas/aceitar-em-lote"),
    ("POST", f"/transacoes-importadas/{uuid4()}/dividir"),
    ("GET", "/investimentos"),
    ("GET", "/investimentos/resumo"),
    ("GET", "/investimentos/historico?inicio=2026-10-01&fim=2026-10-31"),
    ("GET", f"/investimentos/{uuid4()}/realocacoes"),
    ("POST", f"/investimentos/{uuid4()}/realocacoes"),
    ("POST", f"/investimentos/{uuid4()}/destinacoes"),
    ("DELETE", f"/investimentos/{uuid4()}/realocacoes/{uuid4()}"),
    ("DELETE", f"/movimentos-de-investimento/{uuid4()}"),
    ("POST", f"/movimentos-de-investimento/{uuid4()}/desfazer-classificacao"),
    ("GET", "/movimentos-de-investimento?inicio=2026-10-01&fim=2026-10-31"),
    ("POST", f"/movimentos-de-investimento/{uuid4()}/destinacoes"),
    ("GET", "/revisao-de-investimentos"),
    ("POST", f"/revisao-de-investimentos/aportes/{uuid4()}"),
    ("POST", f"/revisao-de-investimentos/gastos/{uuid4()}"),
    ("POST", f"/revisao-de-investimentos/recorrencias/{uuid4()}"),
    ("GET", "/reservas-das-destinacoes?categoria=conforto"),
    ("POST", f"/gastos/{uuid4()}/coberturas"),
    ("DELETE", f"/gastos/{uuid4()}/coberturas/{uuid4()}"),
    ("PUT", "/cores-das-destinacoes"),
    ("DELETE", "/cores-das-destinacoes?tag=celular"),
    ("GET", "/resgates-sem-destinacao"),
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
        "/contas/": "/contas/{conta_id}",
        "/ganhos/": "/ganhos/{ganho_id}",
        "/recorrencias/": "/recorrencias/{recorrencia_id}",
        "/metas/lazer": "/metas/{categoria}",
    }

    def _normalizar(caminho: str) -> str:
        if caminho.startswith("/contas/") and caminho.endswith("/papel"):
            return "/contas/{conta_id}/papel"
        if caminho.startswith("/transferencias-entre-contas/"):
            return "/transferencias-entre-contas/{transferencia_id}/completar-par"
        if caminho.startswith("/investimentos/") and "/referencias-da-caixinha/" in caminho:
            return "/investimentos/{investimento_id}/referencias-da-caixinha/{mes}"
        if caminho.startswith("/investimentos/") and caminho.endswith("/reconciliacao"):
            return "/investimentos/{investimento_id}/reconciliacao"
        if caminho.startswith("/faturas/"):
            return "/faturas/{fatura_id}"
        if caminho.startswith("/revisao-de-investimentos/"):
            recurso = caminho.split("/")[2]
            return f"/revisao-de-investimentos/{recurso}/{{id}}"
        if caminho.startswith("/gastos/"):
            if caminho.endswith("/coberturas"):
                return "/gastos/{id}/coberturas"
            if "/coberturas/" in caminho:
                return "/gastos/{id}/coberturas/{cobertura_id}"
        if caminho.startswith("/investimentos/") and "/realocacoes/" in caminho:
            return "/investimentos/{investimento_id}/realocacoes/{realocacao_id}"
        if caminho.startswith("/investimentos/") and caminho.endswith("/realocacoes"):
            return "/investimentos/{investimento_id}/realocacoes"
        if caminho.startswith("/investimentos/") and caminho.endswith("/destinacoes"):
            return "/investimentos/{investimento_id}/destinacoes"
        if caminho.startswith("/aportes-sem-investimento/"):
            return "/aportes-sem-investimento/{movimento_id}/" + caminho.rsplit("/", 1)[1]
        if caminho.startswith("/operacoes/"):
            return "/operacoes/{operacao_id}"
        if caminho.startswith("/investimentos/") and caminho.endswith("/alocar-sem-caixinha"):
            return "/investimentos/{investimento_id}/alocar-sem-caixinha"
        if caminho.startswith("/investimentos/") and caminho.endswith("/operacoes"):
            return "/investimentos/{investimento_id}/operacoes"
        if caminho.startswith("/casamentos/") and caminho.endswith("/refazer"):
            return "/casamentos/{casamento_id}/refazer"
        if caminho.startswith("/casamentos/"):
            return "/casamentos/{casamento_id}"
        if caminho.startswith("/reaplicacoes-de-resgates/"):
            return "/reaplicacoes-de-resgates/{id}"
        if caminho.startswith("/movimentos-de-investimento/"):
            if caminho.endswith("/natureza-do-resgate"):
                return "/movimentos-de-investimento/{id}/natureza-do-resgate"
            if caminho.endswith("/resgates-para-reaplicar"):
                return "/movimentos-de-investimento/{aporte_id}/resgates-para-reaplicar"
            if caminho.endswith("/desfazer-classificacao"):
                return "/movimentos-de-investimento/{movimento_id}/desfazer-classificacao"
            if caminho.endswith("/destinacoes"):
                return "/movimentos-de-investimento/{movimento_id}/destinacoes"
            return "/movimentos-de-investimento/{movimento_id}"
        if caminho.startswith("/transacoes-importadas/") and caminho != (
            "/transacoes-importadas/aceitar-em-lote"
        ):
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


@pytest.fixture(params=["leitura", "escrita"])
def chave_de_api_valida(cliente, autenticar, request):
    sessao = autenticar()
    resposta = cliente.post(
        "/chaves-de-api",
        json={"nome": "teste de sessao obrigatoria", "escopo": request.param},
        headers=sessao,
    )
    assert resposta.status_code == 201
    cabecalhos = {"Authorization": f"Bearer {resposta.json()['segredo']}"}
    assert cliente.get("/contas", headers=cabecalhos).status_code == 200
    return cabecalhos


@pytest.mark.parametrize(
    ("metodo", "caminho", "corpo"),
    [
        ("GET", "/revisao-de-investimentos", None),
        ("GET", "/reservas-das-destinacoes?categoria=conforto", None),
        ("POST", f"/revisao-de-investimentos/aportes/{uuid4()}", {"categoria": "conforto"}),
        ("POST", f"/revisao-de-investimentos/gastos/{uuid4()}", {"categoria": "conforto"}),
        ("POST", f"/revisao-de-investimentos/recorrencias/{uuid4()}", {"categoria": "conforto"}),
        ("POST", f"/gastos/{uuid4()}/coberturas", {"tag": "celular", "valor": "30.00"}),
        ("DELETE", f"/gastos/{uuid4()}/coberturas/{uuid4()}", None),
        ("POST", f"/movimentos-de-investimento/{uuid4()}/desfazer-classificacao", None),
    ],
)
def test_rota_de_revisao_ou_cobertura_recusa_chave_de_api_valida(
    cliente, chave_de_api_valida, metodo, caminho, corpo
):
    resposta = cliente.request(metodo, caminho, json=corpo, headers=chave_de_api_valida)

    assert resposta.status_code == 403
    assert resposta.json()["erro"]["codigo"] == "acesso_negado"


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
