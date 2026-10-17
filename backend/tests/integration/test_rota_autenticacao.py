from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from gastoba.api.app import criar_app
from gastoba.infrastructure.persistencia.banco import criar_engine
from gastoba.infrastructure.persistencia.modelos import Base
from gastoba.infrastructure.seguranca.hasher_de_senha_scrypt import HasherDeSenhaScrypt
from gastoba.infrastructure.seguranca.limitador_de_tentativas_em_memoria import (
    LimitadorDeTentativasEmMemoria,
)

SENHA_DE_TESTE = "senha-de-teste-1"  # a mesma da fixture `autenticar`
MENSAGEM_DE_CREDENCIAIS_INVALIDAS = "E-mail ou senha incorretos."


class RelogioFixo:
    def __init__(self, instante: datetime) -> None:
        self.instante = instante

    def agora(self) -> datetime:
        return self.instante

    def avancar(self, intervalo: timedelta) -> None:
        self.instante += intervalo


def _cliente_com(configuracoes_teste, **alteracoes) -> TestClient:
    configuracoes = configuracoes_teste.model_copy(update=alteracoes)
    engine = criar_engine(configuracoes.url_banco)
    Base.metadata.create_all(engine)
    engine.dispose()
    app = criar_app(configuracoes)
    app.state.hasher_de_senha = HasherDeSenhaScrypt(n=2, r=1, p=1)
    return TestClient(app, base_url="http://localhost")


@pytest.fixture
def cliente_com_cadastro_aberto(configuracoes_teste):
    with _cliente_com(configuracoes_teste, cadastro_aberto=True) as cliente:
        yield cliente


def _entrar(cliente, email="ana@x.com", senha=SENHA_DE_TESTE):
    return cliente.post("/auth/entrar", json={"email": email, "senha": senha})


def _cookies_definidos(resposta) -> list[str]:
    return resposta.headers.get_list("set-cookie")


def _confere_erro(resposta, status_code: int, codigo: str) -> dict:
    assert resposta.status_code == status_code
    corpo = resposta.json()
    assert set(corpo) == {"erro"}
    assert corpo["erro"]["codigo"] == codigo
    assert corpo["erro"]["mensagem"]
    return corpo["erro"]


# POST /auth/cadastro


def test_cadastro_aberto_cria_usuario_e_devolve_201(cliente_com_cadastro_aberto):
    resposta = cliente_com_cadastro_aberto.post(
        "/auth/cadastro",
        json={"nome": "Ana", "email": " Ana@X.com ", "senha": SENHA_DE_TESTE},
    )

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert set(corpo) == {"id", "email", "nome"}
    UUID(corpo["id"])
    assert corpo["email"] == "ana@x.com"
    assert corpo["nome"] == "Ana"
    assert SENHA_DE_TESTE not in resposta.text
    assert _entrar(cliente_com_cadastro_aberto).status_code == 200


def test_cadastro_fechado_devolve_403(cliente):
    resposta = cliente.post(
        "/auth/cadastro", json={"nome": "Ana", "email": "ana@x.com", "senha": SENHA_DE_TESTE}
    )

    _confere_erro(resposta, 403, "cadastro_fechado")


def test_cadastro_com_email_repetido_devolve_409_sem_ecoar_o_email(cliente_com_cadastro_aberto):
    corpo = {"nome": "Ana", "email": "ana@x.com", "senha": SENHA_DE_TESTE}
    assert cliente_com_cadastro_aberto.post("/auth/cadastro", json=corpo).status_code == 201

    resposta = cliente_com_cadastro_aberto.post(
        "/auth/cadastro", json={**corpo, "email": "ANA@x.com"}
    )

    _confere_erro(resposta, 409, "email_ja_cadastrado")
    assert "ana@x.com" not in resposta.text.lower()
    assert SENHA_DE_TESTE not in resposta.text


@pytest.mark.parametrize(
    ("campos", "codigo"),
    [
        ({"email": "sem-arroba"}, "email_invalido"),
        ({"senha": "curta"}, "senha_invalida"),
        ({"senha": "s" * 129}, "senha_invalida"),
        ({"nome": "  "}, "nome_invalido"),
    ],
)
def test_cadastro_com_dados_invalidos_devolve_422(cliente_com_cadastro_aberto, campos, codigo):
    corpo = {"nome": "Ana", "email": "ana@x.com", "senha": SENHA_DE_TESTE, **campos}

    resposta = cliente_com_cadastro_aberto.post("/auth/cadastro", json=corpo)

    _confere_erro(resposta, 422, codigo)
    assert "sem-arroba" not in resposta.text
    assert "curta" not in resposta.text


def test_cadastro_sem_senha_devolve_422_requisicao_invalida(cliente_com_cadastro_aberto):
    resposta = cliente_com_cadastro_aberto.post(
        "/auth/cadastro", json={"nome": "Ana", "email": "ana@x.com"}
    )

    _confere_erro(resposta, 422, "requisicao_invalida")


# POST /auth/entrar


def test_entrar_devolve_token_expiracao_e_cookie(cliente, autenticar):
    autenticar()
    antes = datetime.now(UTC)

    resposta = _entrar(cliente)

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert set(corpo) == {"token", "expira_em"}
    assert corpo["token"].startswith("gsess_")
    expira_em = datetime.fromisoformat(corpo["expira_em"])
    assert antes + timedelta(hours=12) <= expira_em <= datetime.now(UTC) + timedelta(hours=12)
    [cookie] = _cookies_definidos(resposta)
    assert cookie.startswith(f"gastoba_sessao={corpo['token']};")
    assert SENHA_DE_TESTE not in resposta.text


def test_entrar_sem_endereco_de_quem_chama_funciona(cliente, autenticar):
    # Servidores ASGI podem não informar o cliente (ex.: socket Unix): request.client é None.
    autenticar()
    sem_endereco = TestClient(cliente.app, base_url="http://localhost", client=None)

    resposta = _entrar(sem_endereco)

    assert resposta.status_code == 200
    assert resposta.json()["token"].startswith("gsess_")


def test_token_do_login_autentica_por_bearer(cliente, autenticar):
    autenticar()
    token = _entrar(cliente).json()["token"]
    cliente.cookies.clear()

    resposta = cliente.get("/auth/eu", headers={"Authorization": f"Bearer {token}"})

    assert resposta.status_code == 200
    assert resposta.json()["email"] == "ana@x.com"


def test_cookie_de_sessao_tem_as_flags_de_seguranca(cliente, autenticar):
    autenticar()

    [cookie] = _cookies_definidos(_entrar(cliente))

    atributos = [parte.strip().lower() for parte in cookie.split(";")[1:]]
    assert "httponly" in atributos
    assert "samesite=strict" in atributos
    assert "secure" in atributos
    assert "path=/" in atributos
    assert f"max-age={12 * 3600}" in atributos


def test_cookie_sem_secure_quando_configurado(configuracoes_teste):
    with _cliente_com(
        configuracoes_teste, cookie_seguro=False, duracao_da_sessao_horas=2, cadastro_aberto=True
    ) as cliente:
        cliente.post(
            "/auth/cadastro",
            json={"nome": "Ana", "email": "ana@x.com", "senha": SENHA_DE_TESTE},
        )

        [cookie] = _cookies_definidos(_entrar(cliente))

    atributos = [parte.strip().lower() for parte in cookie.split(";")[1:]]
    assert "secure" not in atributos
    assert "httponly" in atributos
    assert "samesite=strict" in atributos
    assert f"max-age={2 * 3600}" in atributos


def test_email_inexistente_e_senha_errada_tem_a_mesma_resposta(cliente, autenticar):
    autenticar()

    senha_errada = _entrar(cliente, senha="outra-senha-123")
    email_inexistente = _entrar(cliente, email="bia@x.com")
    formato_invalido = _entrar(cliente, email="sem-arroba")

    for resposta in (senha_errada, email_inexistente, formato_invalido):
        assert resposta.status_code == 401
        assert resposta.headers["www-authenticate"] == "Bearer"
        assert "set-cookie" not in resposta.headers
        assert resposta.json() == {
            "erro": {
                "codigo": "credenciais_invalidas",
                "mensagem": MENSAGEM_DE_CREDENCIAIS_INVALIDAS,
            }
        }
    assert senha_errada.content == email_inexistente.content
    assert "outra-senha-123" not in senha_errada.text
    assert "bia@x.com" not in email_inexistente.text


# Limite de tentativas


def test_cinco_falhas_por_email_bloqueiam_com_429_e_retry_after(cliente, autenticar):
    autenticar()
    for _ in range(5):
        assert _entrar(cliente, senha="senha-errada-1").status_code == 401

    bloqueada = _entrar(cliente)  # mesmo com a senha certa

    erro = _confere_erro(bloqueada, 429, "muitas_tentativas")
    assert int(bloqueada.headers["retry-after"]) == 15 * 60
    assert "set-cookie" not in bloqueada.headers
    assert "ana@x.com" not in erro["mensagem"]


def test_cinco_falhas_por_ip_bloqueiam_outros_emails(cliente, autenticar):
    autenticar()
    for indice in range(5):
        assert _entrar(cliente, email=f"pessoa{indice}@x.com").status_code == 401

    resposta = _entrar(cliente)

    _confere_erro(resposta, 429, "muitas_tentativas")


def test_sucesso_zera_o_contador_do_email(cliente, autenticar):
    autenticar()
    for _ in range(4):
        _entrar(cliente, senha="senha-errada-1")
    assert _entrar(cliente).status_code == 200
    # O IP ainda guarda as 4 falhas; a tentativa certa foi descontada.
    resposta = _entrar(cliente, senha="senha-errada-1")

    _confere_erro(resposta, 401, "credenciais_invalidas")
    _confere_erro(_entrar(cliente, senha="senha-errada-1"), 429, "muitas_tentativas")


def test_bloqueio_acaba_depois_da_janela(cliente, autenticar):
    relogio = RelogioFixo(datetime(2026, 10, 12, 12, 0, tzinfo=UTC))
    cliente.app.state.limitador_de_tentativas = LimitadorDeTentativasEmMemoria(
        limite=5, janela=timedelta(minutes=15), relogio=relogio
    )
    autenticar()
    for _ in range(5):
        _entrar(cliente, senha="senha-errada-1")
    assert _entrar(cliente).status_code == 429

    relogio.avancar(timedelta(minutes=15))

    assert _entrar(cliente).status_code == 200


def test_limite_vem_da_configuracao(configuracoes_teste):
    with _cliente_com(configuracoes_teste, tentativas_de_login=2) as cliente:
        for _ in range(2):
            assert _entrar(cliente).status_code == 401

        assert _entrar(cliente).status_code == 429


# POST /auth/sair


def test_sair_revoga_a_sessao_e_a_segunda_vez_devolve_401(cliente, autenticar):
    sessao = autenticar()

    resposta = cliente.post("/auth/sair", headers=sessao)

    assert resposta.status_code == 204
    assert resposta.content == b""
    assert cliente.get("/contas", headers=sessao).status_code == 401
    segunda = cliente.post("/auth/sair", headers=sessao)
    _confere_erro(segunda, 401, "nao_autenticado")


def test_sair_apaga_o_cookie(cliente, autenticar):
    sessao = autenticar()

    resposta = cliente.post("/auth/sair", headers=sessao)

    [cookie] = _cookies_definidos(resposta)
    atributos = [parte.strip().lower() for parte in cookie.split(";")]
    assert atributos[0] in ('gastoba_sessao=""', "gastoba_sessao=")
    assert "max-age=0" in atributos
    assert "httponly" in atributos
    assert "samesite=strict" in atributos
    assert "path=/" in atributos


def test_sair_so_revoga_a_propria_sessao(cliente, autenticar):
    primeira = autenticar()
    segunda = {"Authorization": f"Bearer {_entrar(cliente).json()['token']}"}
    cliente.cookies.clear()

    assert cliente.post("/auth/sair", headers=primeira).status_code == 204

    assert cliente.get("/auth/eu", headers=segunda).status_code == 200


def test_chave_de_api_nao_sai(cliente, autenticar):
    sessao = autenticar()
    chave = cliente.post(
        "/chaves-de-api", json={"nome": "script", "escopo": "escrita"}, headers=sessao
    ).json()["segredo"]

    resposta = cliente.post("/auth/sair", headers={"Authorization": f"Bearer {chave}"})

    _confere_erro(resposta, 403, "acesso_negado")


# GET /auth/eu


def test_eu_devolve_o_usuario_da_sessao(cliente, autenticar):
    sessao = autenticar(email="ana@x.com", nome="Ana")

    resposta = cliente.get("/auth/eu", headers=sessao)

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert set(corpo) == {"id", "email", "nome", "importacao_bancaria"}
    assert corpo["email"] == "ana@x.com"
    assert corpo["nome"] == "Ana"
    assert corpo["importacao_bancaria"] is False


def test_eu_aceita_chave_de_leitura(cliente, autenticar):
    sessao = autenticar()
    chave = cliente.post(
        "/chaves-de-api", json={"nome": "script", "escopo": "leitura"}, headers=sessao
    ).json()["segredo"]

    resposta = cliente.get("/auth/eu", headers={"Authorization": f"Bearer {chave}"})

    assert resposta.status_code == 200
    assert resposta.json()["email"] == "ana@x.com"


def test_sessao_expirada_devolve_401(cliente, autenticar):
    sessao = autenticar()
    cliente.app.state.relogio = RelogioFixo(datetime.now(UTC) + timedelta(hours=12, seconds=1))

    resposta = cliente.get("/auth/eu", headers=sessao)

    _confere_erro(resposta, 401, "nao_autenticado")


# Cookie de sessão e proteção contra CSRF


@pytest.fixture
def cookie_de_sessao(cliente, autenticar) -> dict[str, str]:
    token = autenticar()["Authorization"].removeprefix("Bearer ")
    return {"Cookie": f"gastoba_sessao={token}"}


def test_cookie_autentica_leitura_sem_cabecalho_extra(cliente, cookie_de_sessao):
    resposta = cliente.get("/contas", headers=cookie_de_sessao)

    assert resposta.status_code == 200


def test_escrita_por_cookie_sem_cabecalho_anti_csrf_devolve_403(cliente, cookie_de_sessao):
    resposta = cliente.post("/contas", json={"nome": "Nubank"}, headers=cookie_de_sessao)

    _confere_erro(resposta, 403, "requisicao_invalida_origem")
    assert cliente.get("/contas", headers=cookie_de_sessao).json() == []


@pytest.mark.parametrize("valor", ["0", "true", ""])
def test_cabecalho_anti_csrf_com_valor_errado_devolve_403(cliente, cookie_de_sessao, valor):
    resposta = cliente.post(
        "/contas",
        json={"nome": "Nubank"},
        headers={**cookie_de_sessao, "X-Gastoba-Requisicao": valor},
    )

    _confere_erro(resposta, 403, "requisicao_invalida_origem")


def test_escrita_por_cookie_com_cabecalho_anti_csrf_funciona(cliente, cookie_de_sessao):
    resposta = cliente.post(
        "/contas",
        json={"nome": "Nubank"},
        headers={**cookie_de_sessao, "X-Gastoba-Requisicao": "1"},
    )

    assert resposta.status_code == 201


def test_sair_por_cookie_exige_o_cabecalho_anti_csrf(cliente, cookie_de_sessao):
    _confere_erro(
        cliente.post("/auth/sair", headers=cookie_de_sessao), 403, "requisicao_invalida_origem"
    )

    resposta = cliente.post("/auth/sair", headers={**cookie_de_sessao, "X-Gastoba-Requisicao": "1"})

    assert resposta.status_code == 204
    assert cliente.get("/contas", headers=cookie_de_sessao).status_code == 401


def test_escrita_por_bearer_nao_exige_o_cabecalho_anti_csrf(cliente, autenticar):
    resposta = cliente.post("/contas", json={"nome": "Nubank"}, headers=autenticar())

    assert resposta.status_code == 201


def test_login_e_cadastro_nao_exigem_o_cabecalho_anti_csrf(cliente_com_cadastro_aberto):
    cadastro = cliente_com_cadastro_aberto.post(
        "/auth/cadastro", json={"nome": "Ana", "email": "ana@x.com", "senha": SENHA_DE_TESTE}
    )

    assert cadastro.status_code == 201
    assert _entrar(cliente_com_cadastro_aberto).status_code == 200


def test_cookie_do_login_e_aceito_nas_requisicoes_seguintes(configuracoes_teste):
    # Sem Secure (HTTP na VPN), o próprio cliente devolve o cookie, como um navegador.
    with _cliente_com(configuracoes_teste, cookie_seguro=False, cadastro_aberto=True) as cliente:
        cliente.post(
            "/auth/cadastro", json={"nome": "Ana", "email": "ana@x.com", "senha": SENHA_DE_TESTE}
        )
        assert _entrar(cliente).status_code == 200

        assert cliente.get("/auth/eu").status_code == 200
        assert cliente.post("/contas", json={"nome": "Nubank"}).status_code == 403
        criada = cliente.post(
            "/contas", json={"nome": "Nubank"}, headers={"X-Gastoba-Requisicao": "1"}
        )
        assert criada.status_code == 201
