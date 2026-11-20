import pytest

PADRAO = {
    "matiz": 258,
    "intensidade": "media",
    "textura": "nenhuma",
    "nome": "Gastoba",
    "marca": "olho",
    "personalizada": False,
}
ESCOLHA = {
    "matiz": 12,
    "intensidade": "viva",
    "textura": "pontos",
    "nome": "  Meu cofre ",
    "marca": "cofre",
}


@pytest.fixture
def ana(autenticar):
    return autenticar(email="ana@x.com", nome="Ana")


@pytest.fixture
def bia(autenticar):
    return autenticar(email="bia@x.com", nome="Bia")


def _chave(cliente, sessao, escopo):
    r = cliente.post("/chaves-de-api", json={"nome": "k", "escopo": escopo}, headers=sessao)
    return {"Authorization": f"Bearer {r.json()['segredo']}"}


def _erro(resposta, status, codigo):
    assert resposta.status_code == status
    assert resposta.json()["erro"]["codigo"] == codigo


def test_sem_escolha_o_perfil_traz_a_aparencia_padrao(cliente, ana):
    assert cliente.get("/auth/eu", headers=ana).json()["aparencia"] == PADRAO


def test_salvar_aparece_no_perfil_e_restaurar_volta_ao_padrao(cliente, ana):
    resposta = cliente.put("/aparencia", json=ESCOLHA, headers=ana)
    esperado = {**ESCOLHA, "nome": "Meu cofre", "personalizada": True}
    assert resposta.status_code == 200 and resposta.json() == esperado
    assert cliente.get("/auth/eu", headers=ana).json()["aparencia"] == esperado
    assert cliente.delete("/aparencia", headers=ana).status_code == 204
    assert cliente.delete("/aparencia", headers=ana).status_code == 204
    assert cliente.get("/auth/eu", headers=ana).json()["aparencia"] == PADRAO


def test_opcoes_vem_dos_enums(cliente, ana):
    corpo = cliente.get("/aparencia/opcoes", headers=ana).json()
    assert set(corpo) == {"intensidades", "texturas", "marcas"}
    assert [o["codigo"] for o in corpo["intensidades"]] == ["suave", "media", "viva"]
    assert [o["codigo"] for o in corpo["texturas"]] == [
        "nenhuma",
        "pontos",
        "linhas",
        "grade",
        "grao",
    ]
    assert [o["codigo"] for o in corpo["marcas"]] == [
        "olho",
        "inicial",
        "moeda",
        "cofre",
        "folha",
        "grafico",
    ]
    assert all(o["nome"] for grupo in corpo.values() for o in grupo)


@pytest.mark.parametrize(
    "campo,valor",
    [("matiz", 360), ("matiz", -1), ("nome", ""), ("nome", "   "), ("nome", "x" * 21)],
)
def test_valor_invalido_devolve_422_e_nao_grava(cliente, ana, campo, valor):
    resposta = cliente.put("/aparencia", json={**ESCOLHA, campo: valor}, headers=ana)
    _erro(resposta, 422, "aparencia_invalida")
    assert cliente.get("/auth/eu", headers=ana).json()["aparencia"] == PADRAO


@pytest.mark.parametrize(
    "campo,valor",
    [("matiz", "10"), ("matiz", 1.5), ("textura", "holograma"), ("marca", "x"), ("nome", 5)],
)
def test_tipo_ou_codigo_errado_devolve_requisicao_invalida(cliente, ana, campo, valor):
    resposta = cliente.put("/aparencia", json={**ESCOLHA, campo: valor}, headers=ana)
    _erro(resposta, 422, "requisicao_invalida")


def test_sem_credencial_devolve_401(cliente):
    for resposta in (
        cliente.get("/aparencia/opcoes"),
        cliente.put("/aparencia", json=ESCOLHA),
        cliente.delete("/aparencia"),
    ):
        _erro(resposta, 401, "nao_autenticado")


def test_chave_de_leitura_nao_grava_e_a_de_escrita_grava(cliente, ana):
    leitura = _chave(cliente, ana, "leitura")
    _erro(cliente.put("/aparencia", json=ESCOLHA, headers=leitura), 403, "acesso_negado")
    _erro(cliente.delete("/aparencia", headers=leitura), 403, "acesso_negado")
    assert cliente.get("/aparencia/opcoes", headers=leitura).status_code == 200
    escrita = _chave(cliente, ana, "escrita")
    assert cliente.put("/aparencia", json=ESCOLHA, headers=escrita).status_code == 200


def test_cookie_exige_cabecalho_anti_csrf(cliente, ana):
    cookie = {"Cookie": "gastoba_sessao=" + ana["Authorization"].removeprefix("Bearer ")}
    _erro(
        cliente.put("/aparencia", json=ESCOLHA, headers=cookie), 403, "requisicao_invalida_origem"
    )
    _erro(cliente.delete("/aparencia", headers=cookie), 403, "requisicao_invalida_origem")
    com = {**cookie, "X-Gastoba-Requisicao": "1"}
    assert cliente.put("/aparencia", json=ESCOLHA, headers=com).status_code == 200


def test_duas_pessoas_nao_se_veem(cliente, ana, bia):
    cliente.put("/aparencia", json=ESCOLHA, headers=ana)
    assert cliente.get("/auth/eu", headers=bia).json()["aparencia"] == PADRAO
    cliente.put("/aparencia", json={**ESCOLHA, "nome": "Da Bia"}, headers=bia)
    cliente.delete("/aparencia", headers=bia)
    assert cliente.get("/auth/eu", headers=ana).json()["aparencia"]["nome"] == "Meu cofre"
