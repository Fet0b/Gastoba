from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from gastoba.api.app import criar_app
from gastoba.infrastructure.configuracoes import Configuracoes
from gastoba.infrastructure.persistencia.banco import criar_engine
from gastoba.infrastructure.persistencia.modelos import (
    Base,
    CadastroDeDestinacaoModelo,
    CaixinhaMarcadaModelo,
    ContaModelo,
    CorDaDestinacaoModelo,
    UsuarioModelo,
)
from gastoba.infrastructure.seguranca.hasher_de_senha_scrypt import HasherDeSenhaScrypt


@pytest.fixture(scope="module")
def cliente(tmp_path_factory):
    configuracoes = Configuracoes(
        url_banco=f"sqlite:///{tmp_path_factory.mktemp('rotas-caixinhas')}/teste.db",
        origens_permitidas=["http://localhost:5173"],
        hosts_permitidos=["localhost", "127.0.0.1"],
        cadastro_aberto=False,
        duracao_da_sessao_horas=12,
        cookie_seguro=True,
        tentativas_de_login=5,
        intervalo_de_recorrencias_minutos=0,
    )
    engine = criar_engine(configuracoes.url_banco)
    Base.metadata.create_all(engine)
    engine.dispose()
    app = criar_app(configuracoes)
    app.state.hasher_de_senha = HasherDeSenhaScrypt(n=2, r=1, p=1)
    with TestClient(app, base_url="http://localhost") as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def limpar_banco(cliente):
    conexao = cliente.app.state.engine.raw_connection()
    try:
        cursor = conexao.cursor()
        cursor.execute("PRAGMA foreign_keys=OFF")
        for tabela in reversed(Base.metadata.sorted_tables):
            cursor.execute(f'DELETE FROM "{tabela.name}"')
        conexao.commit()
        cursor.execute("PRAGMA foreign_keys=ON")
        conexao.commit()
    finally:
        conexao.close()


def _erro(resposta, status, codigo):
    assert resposta.status_code == status
    corpo = resposta.json()
    assert corpo["erro"]["codigo"] == codigo
    assert corpo["erro"]["mensagem"]
    assert "Traceback" not in resposta.text


def _criar(cliente, cabecalho, nome="viagem"):
    return cliente.post("/destinacoes-cadastradas", json={"nome": nome}, headers=cabecalho)


def _chave(cliente, sessao, escopo):
    resposta = cliente.post(
        "/chaves-de-api", json={"nome": "teste", "escopo": escopo}, headers=sessao
    )
    assert resposta.status_code == 201
    return {"Authorization": f"Bearer {resposta.json()['segredo']}"}


def test_get_post_normaliza_persiste_sem_criar_posicao_ou_conta(cliente, autenticar):
    ana = autenticar()
    assert cliente.get("/destinacoes-cadastradas", headers=ana).json() == []

    resposta = _criar(cliente, ana, "  VIAGEM   São João ")

    assert resposta.status_code == 201
    assert resposta.json()["nome"] == "viagem são joão"
    assert UUID(resposta.json()["id"])
    assert cliente.get("/destinacoes-cadastradas", headers=ana).json() == [resposta.json()]
    with cliente.app.state.fabrica_de_sessoes() as sessao:
        assert sessao.query(ContaModelo).count() == 0
        assert sessao.query(UsuarioModelo).count() == 1


def test_nome_invalido_duplicado_e_retry_nao_criam_segunda_identidade(cliente, autenticar):
    ana = autenticar()
    _erro(_criar(cliente, ana, "\x00"), 422, "tag_invalida")
    assert _criar(cliente, ana, "Viagem").status_code == 201

    erro = _criar(cliente, ana, "  VIAGEM  ")

    _erro(erro, 409, "destinacao_ja_cadastrada")
    assert len(cliente.get("/destinacoes-cadastradas", headers=ana).json()) == 1


def test_isolamento_404_igual_a_inexistente_e_exclusao_com_referencia(cliente, autenticar):
    ana = autenticar(email="ana@example.com")
    bia = autenticar(email="bia@example.com")
    criada = _criar(cliente, ana).json()
    id_alheio = criada["id"]

    assert cliente.get("/destinacoes-cadastradas", headers=bia).json() == []
    _erro(
        cliente.delete(f"/destinacoes-cadastradas/{id_alheio}", headers=bia),
        404,
        "destinacao_cadastrada_nao_encontrada",
    )
    with cliente.app.state.fabrica_de_sessoes() as sessao:
        cadastro = sessao.query(CadastroDeDestinacaoModelo).one()
        sessao.add(CaixinhaMarcadaModelo(destinacao_id=cadastro.id, categoria="lazer"))
        sessao.commit()
    _erro(
        cliente.delete(f"/destinacoes-cadastradas/{id_alheio}", headers=ana),
        409,
        "destinacao_em_uso",
    )
    assert cliente.get("/destinacoes-cadastradas", headers=ana).json()[0]["id"] == id_alheio


def test_exclusao_vazia_repetida_e_nome_recriado_tem_nova_identidade(cliente, autenticar):
    ana = autenticar()
    criada = _criar(cliente, ana, "viagem").json()
    url = f"/destinacoes-cadastradas/{criada['id']}"

    removida = cliente.delete(url, headers=ana)
    assert removida.status_code == 204 and removida.content == b""
    _erro(cliente.delete(url, headers=ana), 404, "destinacao_cadastrada_nao_encontrada")
    recriada = _criar(cliente, ana, "viagem").json()
    assert recriada["id"] != criada["id"]
    _erro(cliente.delete(url, headers=ana), 404, "destinacao_cadastrada_nao_encontrada")


def test_auth_chaves_e_csrf_seguem_padroes_existentes(cliente, autenticar):
    ana = autenticar()
    token = ana["Authorization"].removeprefix("Bearer ")
    cookie = {"Cookie": f"gastoba_sessao={token}"}
    com_csrf = cookie | {"X-Gastoba-Requisicao": "1"}
    assert cliente.get("/destinacoes-cadastradas", headers=cookie).status_code == 200
    _erro(_criar(cliente, cookie), 403, "requisicao_invalida_origem")
    assert _criar(cliente, com_csrf).status_code == 201
    _erro(cliente.get("/destinacoes-cadastradas"), 401, "nao_autenticado")

    leitura = _chave(cliente, ana, "leitura")
    assert cliente.get("/destinacoes-cadastradas", headers=leitura).status_code == 200
    _erro(_criar(cliente, leitura, "leitura"), 403, "acesso_negado")
    escrita = _chave(cliente, ana, "escrita")
    assert _criar(cliente, escrita, "escrita").status_code == 201


def _icone(cliente, cabecalho, destinacao_id, icone):
    return cliente.put(
        f"/destinacoes-cadastradas/{destinacao_id}/icone",
        json={"icone": icone},
        headers=cabecalho,
    )


def test_get_e_post_trazem_icone_e_cor_nulos_por_padrao(cliente, autenticar):
    ana = autenticar()

    criada = _criar(cliente, ana).json()

    assert criada["icone"] is None and criada["cor"] is None
    assert cliente.get("/destinacoes-cadastradas", headers=ana).json() == [criada]


def test_post_aceita_cor_e_icone_e_devolve_os_dois(cliente, autenticar):
    ana = autenticar()

    resposta = cliente.post(
        "/destinacoes-cadastradas",
        json={"nome": "viagem", "cor": "coral", "icone": "aviao"},
        headers=ana,
    )

    assert resposta.status_code == 201
    assert resposta.json()["cor"] == "coral" and resposta.json()["icone"] == "aviao"
    assert cliente.get("/destinacoes-cadastradas", headers=ana).json() == [resposta.json()]
    with cliente.app.state.fabrica_de_sessoes() as sessao:
        assert sessao.query(CorDaDestinacaoModelo).one().cor == "coral"


def test_post_com_icone_invalido_ou_cor_invalida_nao_cria_nada(cliente, autenticar):
    ana = autenticar()

    resposta = cliente.post(
        "/destinacoes-cadastradas", json={"nome": "viagem", "icone": "foguete"}, headers=ana
    )
    _erro(resposta, 422, "icone_invalido")
    assert "foguete" not in resposta.text
    _erro(
        cliente.post(
            "/destinacoes-cadastradas", json={"nome": "viagem", "cor": "verde"}, headers=ana
        ),
        422,
        "requisicao_invalida",
    )

    assert cliente.get("/destinacoes-cadastradas", headers=ana).json() == []
    with cliente.app.state.fabrica_de_sessoes() as sessao:
        assert sessao.query(CorDaDestinacaoModelo).count() == 0


def test_put_icone_grava_e_nulo_volta_ao_padrao(cliente, autenticar):
    ana = autenticar()
    criada = _criar(cliente, ana).json()

    resposta = _icone(cliente, ana, criada["id"], "casa")

    assert resposta.status_code == 200
    assert resposta.json() == {**criada, "icone": "casa"}
    assert cliente.get("/destinacoes-cadastradas", headers=ana).json()[0]["icone"] == "casa"
    assert _icone(cliente, ana, criada["id"], "casa").status_code == 200
    assert _icone(cliente, ana, criada["id"], None).json()["icone"] is None


def test_put_icone_de_caixinha_alheia_ou_inexistente_e_404(cliente, autenticar):
    ana = autenticar(email="ana@example.com")
    bia = autenticar(email="bia@example.com")
    criada = _criar(cliente, ana).json()

    for alvo in (criada["id"], str(uuid4())):
        _erro(_icone(cliente, bia, alvo, "casa"), 404, "destinacao_cadastrada_nao_encontrada")

    assert cliente.get("/destinacoes-cadastradas", headers=ana).json()[0]["icone"] is None


def test_put_icone_invalido_e_422_sem_ecoar_e_tipo_errado_e_requisicao_invalida(
    cliente, autenticar
):
    ana = autenticar()
    criada = _criar(cliente, ana).json()

    resposta = _icone(cliente, ana, criada["id"], "foguete")
    _erro(resposta, 422, "icone_invalido")
    assert "foguete" not in resposta.text
    _erro(_icone(cliente, ana, criada["id"], 7), 422, "requisicao_invalida")
    _erro(
        cliente.put(f"/destinacoes-cadastradas/{criada['id']}/icone", json={}, headers=ana),
        422,
        "requisicao_invalida",
    )
    assert cliente.get("/destinacoes-cadastradas", headers=ana).json()[0]["icone"] is None


def test_put_icone_nao_mexe_em_cor_nem_exige_referencia(cliente, autenticar):
    ana = autenticar()
    criada = cliente.post(
        "/destinacoes-cadastradas", json={"nome": "viagem", "cor": "ceu"}, headers=ana
    ).json()

    resposta = _icone(cliente, ana, criada["id"], "carro")

    assert resposta.json()["cor"] == "ceu"


def test_put_icone_chaves_e_csrf(cliente, autenticar):
    ana = autenticar()
    criada = _criar(cliente, ana).json()
    token = ana["Authorization"].removeprefix("Bearer ")
    cookie = {"Cookie": f"gastoba_sessao={token}"}

    _erro(_icone(cliente, cookie, criada["id"], "casa"), 403, "requisicao_invalida_origem")
    assert (
        _icone(cliente, cookie | {"X-Gastoba-Requisicao": "1"}, criada["id"], "casa").status_code
        == 200
    )
    leitura = _chave(cliente, ana, "leitura")
    _erro(_icone(cliente, leitura, criada["id"], "carro"), 403, "acesso_negado")
    escrita = _chave(cliente, ana, "escrita")
    assert _icone(cliente, escrita, criada["id"], "carro").status_code == 200
    assert (
        cliente.put(
            f"/destinacoes-cadastradas/{criada['id']}/icone", json={"icone": "casa"}
        ).status_code
        == 401
    )


def test_excluir_caixinha_sem_uso_apaga_cor_e_icone_juntos_e_cor_nao_gera_destinacao_em_uso(
    cliente, autenticar
):
    ana = autenticar()
    criada = cliente.post(
        "/destinacoes-cadastradas",
        json={"nome": "viagem", "cor": "coral", "icone": "aviao"},
        headers=ana,
    ).json()
    outra = cliente.post(
        "/destinacoes-cadastradas", json={"nome": "casa", "cor": "ceu"}, headers=ana
    ).json()

    removida = cliente.delete(f"/destinacoes-cadastradas/{criada['id']}", headers=ana)

    assert removida.status_code == 204
    with cliente.app.state.fabrica_de_sessoes() as sessao:
        assert [c.cor for c in sessao.query(CorDaDestinacaoModelo)] == ["ceu"]
    assert [d["id"] for d in cliente.get("/destinacoes-cadastradas", headers=ana).json()] == [
        outra["id"]
    ]
    recriada = _criar(cliente, ana, "viagem").json()
    assert recriada["cor"] is None and recriada["icone"] is None
