from uuid import UUID, uuid4

import pytest

from gastoba.infrastructure.persistencia.modelos import CadastroDeDestinacaoModelo

VAZIO = {"ativo": False, "marcacoes": []}
CORPO = {"ativo": True, "marcacoes": [{"categoria": "conforto", "tag": "computador"}]}


@pytest.fixture
def ana(autenticar):
    return autenticar(email="ana@x.com", nome="Ana")


@pytest.fixture
def bia(autenticar):
    return autenticar(email="bia@x.com", nome="Bia")


def _caixinhas(cliente, cabecalho, *nomes):
    """Cadastra destinações direto no banco de teste (o cadastro nasce ao classificar um aporte)."""
    pessoa = UUID(cliente.get("/auth/eu", headers=cabecalho).json()["id"])
    with cliente.app.state.fabrica_de_sessoes() as sessao:
        for nome in nomes:
            sessao.add(CadastroDeDestinacaoModelo(id=uuid4(), usuario_id=pessoa, nome=nome))
        sessao.commit()


def _chave(cliente, sessao, escopo):
    r = cliente.post("/chaves-de-api", json={"nome": "k", "escopo": escopo}, headers=sessao)
    return {"Authorization": f"Bearer {r.json()['segredo']}"}


def _erro(resposta, status, codigo):
    assert resposta.status_code == status
    corpo = resposta.json()
    assert (
        set(corpo) >= {"erro"} and corpo["erro"]["codigo"] == codigo and corpo["erro"]["mensagem"]
    )


def test_get_sem_configuracao_devolve_desligado_e_lista_vazia(cliente, ana):
    resposta = cliente.get("/guardado-nas-metas", headers=ana)
    assert resposta.status_code == 200 and resposta.json() == VAZIO


def test_put_valido_grava_e_o_get_devolve_o_mesmo(cliente, ana):
    _caixinhas(cliente, ana, "computador")
    resposta = cliente.put("/guardado-nas-metas", json=CORPO, headers=ana)
    assert resposta.status_code == 200 and resposta.json() == CORPO
    assert cliente.get("/guardado-nas-metas", headers=ana).json() == CORPO
    desligado = {**CORPO, "ativo": False}
    assert cliente.put("/guardado-nas-metas", json=desligado, headers=ana).json() == desligado
    assert cliente.get("/guardado-nas-metas", headers=ana).json() == desligado


def test_put_normaliza_a_tag(cliente, ana):
    _caixinhas(cliente, ana, "computador novo")
    corpo = {"ativo": True, "marcacoes": [{"categoria": "conforto", "tag": "  Computador  NOVO "}]}
    resposta = cliente.put("/guardado-nas-metas", json=corpo, headers=ana)
    assert resposta.json()["marcacoes"][0]["tag"] == "computador novo"


def test_tag_inexistente_devolve_guardado_invalido(cliente, ana):
    _erro(cliente.put("/guardado-nas-metas", json=CORPO, headers=ana), 422, "guardado_invalido")
    assert cliente.get("/guardado-nas-metas", headers=ana).json() == VAZIO


def test_tag_repetida_devolve_guardado_invalido(cliente, ana):
    _caixinhas(cliente, ana, "computador")
    corpo = {
        "ativo": True,
        "marcacoes": [
            {"categoria": "conforto", "tag": "computador"},
            {"categoria": "lazer", "tag": "computador"},
        ],
    }
    _erro(cliente.put("/guardado-nas-metas", json=corpo, headers=ana), 422, "guardado_invalido")


def test_vinte_e_uma_marcacoes_devolvem_guardado_invalido(cliente, ana):
    nomes = [f"tag{i}" for i in range(21)]
    _caixinhas(cliente, ana, *nomes)
    corpo = {"ativo": True, "marcacoes": [{"categoria": "lazer", "tag": n} for n in nomes]}
    _erro(cliente.put("/guardado-nas-metas", json=corpo, headers=ana), 422, "guardado_invalido")


@pytest.mark.parametrize("categoria", ["investimentos", "liberdade_financeira", "inexistente"])
def test_categoria_legada_ou_desconhecida_devolve_categoria_invalida(cliente, ana, categoria):
    _caixinhas(cliente, ana, "computador")
    corpo = {"ativo": True, "marcacoes": [{"categoria": categoria, "tag": "computador"}]}
    _erro(cliente.put("/guardado-nas-metas", json=corpo, headers=ana), 422, "categoria_invalida")


def test_corpo_de_tipo_errado_devolve_requisicao_invalida(cliente, ana):
    _erro(
        cliente.put("/guardado-nas-metas", json={"ativo": "sim", "marcacoes": []}, headers=ana),
        422,
        "requisicao_invalida",
    )


def test_sem_credencial_devolve_401(cliente):
    _erro(cliente.get("/guardado-nas-metas"), 401, "nao_autenticado")
    _erro(cliente.put("/guardado-nas-metas", json=VAZIO), 401, "nao_autenticado")


def test_chave_de_leitura_le_mas_nao_grava(cliente, ana):
    _caixinhas(cliente, ana, "computador")
    leitura = _chave(cliente, ana, "leitura")
    assert cliente.get("/guardado-nas-metas", headers=leitura).status_code == 200
    _erro(cliente.put("/guardado-nas-metas", json=CORPO, headers=leitura), 403, "acesso_negado")
    assert cliente.get("/guardado-nas-metas", headers=ana).json() == VAZIO


def test_cookie_exige_cabecalho_anti_csrf(cliente, ana):
    _caixinhas(cliente, ana, "computador")
    cookie = {"Cookie": "gastoba_sessao=" + ana["Authorization"].removeprefix("Bearer ")}
    _erro(
        cliente.put("/guardado-nas-metas", json=CORPO, headers=cookie),
        403,
        "requisicao_invalida_origem",
    )
    com = {**cookie, "X-Gastoba-Requisicao": "1"}
    assert cliente.put("/guardado-nas-metas", json=CORPO, headers=com).status_code == 200


def test_duas_pessoas_nao_se_veem_nem_usam_a_caixinha_da_outra(cliente, ana, bia):
    _caixinhas(cliente, ana, "computador")
    cliente.put("/guardado-nas-metas", json=CORPO, headers=ana)
    assert cliente.get("/guardado-nas-metas", headers=bia).json() == VAZIO
    _erro(cliente.put("/guardado-nas-metas", json=CORPO, headers=bia), 422, "guardado_invalido")
    assert cliente.get("/guardado-nas-metas", headers=ana).json() == CORPO
