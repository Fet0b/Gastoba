from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest


class RelogioFixo:
    def __init__(self, instante: datetime) -> None:
        self.instante = instante

    def agora(self) -> datetime:
        return self.instante


def _criar_chave(cliente, sessao, **campos):
    corpo = {"nome": "script", "escopo": "escrita", **campos}
    return cliente.post("/chaves-de-api", json=corpo, headers=sessao)


def _bearer(segredo: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {segredo}"}


def _confere_erro(resposta, status_code: int, codigo: str) -> None:
    assert resposta.status_code == status_code
    corpo = resposta.json()
    assert set(corpo) == {"erro"}
    assert corpo["erro"]["codigo"] == codigo
    assert corpo["erro"]["mensagem"]


@pytest.fixture
def sessao(autenticar):
    return autenticar()


# POST /chaves-de-api


def test_criar_chave_devolve_201_com_o_segredo(cliente, sessao):
    resposta = _criar_chave(cliente, sessao, nome="  Planilha  ", escopo="leitura")

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert set(corpo) == {
        "id",
        "nome",
        "prefixo",
        "escopo",
        "criada_em",
        "ultimo_uso",
        "expira_em",
        "segredo",
    }
    UUID(corpo["id"])
    assert corpo["nome"] == "Planilha"
    assert corpo["escopo"] == "leitura"
    assert len(corpo["prefixo"]) == 8
    assert corpo["segredo"].startswith(f"gapi_{corpo['prefixo']}_")
    assert corpo["ultimo_uso"] is None
    assert corpo["expira_em"] is None


def test_criar_chave_com_expiracao(cliente, sessao):
    expira_em = (datetime.now(UTC) + timedelta(days=30)).replace(microsecond=0)

    resposta = _criar_chave(cliente, sessao, expira_em=expira_em.isoformat())

    assert resposta.status_code == 201
    assert datetime.fromisoformat(resposta.json()["expira_em"]) == expira_em


@pytest.mark.parametrize(
    "expira_em",
    ["2020-01-01T00:00:00Z", "2099-01-01T00:00:00"],
    ids=["no-passado", "sem-fuso-horario"],
)
def test_expiracao_invalida_devolve_422(cliente, sessao, expira_em):
    resposta = _criar_chave(cliente, sessao, expira_em=expira_em)

    _confere_erro(resposta, 422, "expiracao_invalida")


@pytest.mark.parametrize("nome", ["   ", "x" * 61])
def test_nome_invalido_devolve_422(cliente, sessao, nome):
    resposta = _criar_chave(cliente, sessao, nome=nome)

    _confere_erro(resposta, 422, "nome_de_chave_invalido")


def test_escopo_desconhecido_devolve_422_requisicao_invalida(cliente, sessao):
    resposta = _criar_chave(cliente, sessao, escopo="admin")

    _confere_erro(resposta, 422, "requisicao_invalida")


# GET /chaves-de-api


def test_listar_nunca_traz_o_segredo(cliente, sessao):
    segredo = _criar_chave(cliente, sessao, nome="A").json()["segredo"]
    _criar_chave(cliente, sessao, nome="B")

    resposta = cliente.get("/chaves-de-api", headers=sessao)

    assert resposta.status_code == 200
    chaves = resposta.json()
    assert {chave["nome"] for chave in chaves} == {"A", "B"}
    for chave in chaves:
        assert "segredo" not in chave
    assert segredo not in resposta.text
    assert segredo.split("_")[-1] not in resposta.text


def test_listar_mostra_o_ultimo_uso(cliente, sessao):
    segredo = _criar_chave(cliente, sessao).json()["segredo"]
    cliente.get("/contas", headers=_bearer(segredo))

    [chave] = cliente.get("/chaves-de-api", headers=sessao).json()

    assert chave["ultimo_uso"] is not None


# DELETE /chaves-de-api/{id}


def test_revogar_devolve_204_e_a_chave_deixa_de_autenticar(cliente, sessao):
    criada = _criar_chave(cliente, sessao).json()
    assert cliente.get("/contas", headers=_bearer(criada["segredo"])).status_code == 200

    resposta = cliente.delete(f"/chaves-de-api/{criada['id']}", headers=sessao)

    assert resposta.status_code == 204
    assert resposta.content == b""
    _confere_erro(
        cliente.get("/contas", headers=_bearer(criada["segredo"])), 401, "nao_autenticado"
    )
    assert cliente.get("/chaves-de-api", headers=sessao).json() == []


def test_revogar_duas_vezes_devolve_404(cliente, sessao):
    chave_id = _criar_chave(cliente, sessao).json()["id"]
    cliente.delete(f"/chaves-de-api/{chave_id}", headers=sessao)

    resposta = cliente.delete(f"/chaves-de-api/{chave_id}", headers=sessao)

    _confere_erro(resposta, 404, "chave_de_api_nao_encontrada")


def test_revogar_chave_inexistente_devolve_404(cliente, sessao):
    resposta = cliente.delete(f"/chaves-de-api/{uuid4()}", headers=sessao)

    _confere_erro(resposta, 404, "chave_de_api_nao_encontrada")


# Chave de API como credencial


def test_chave_de_leitura_consulta_mas_nao_escreve(cliente, sessao):
    leitura = _bearer(_criar_chave(cliente, sessao, escopo="leitura").json()["segredo"])

    assert cliente.get("/contas", headers=leitura).status_code == 200
    assert cliente.get("/tags", headers=leitura).status_code == 200
    assert cliente.get("/categorias", headers=leitura).status_code == 200
    resposta = cliente.post("/contas", json={"nome": "Nubank"}, headers=leitura)

    _confere_erro(resposta, 403, "acesso_negado")
    assert cliente.get("/contas", headers=leitura).json() == []


def test_chave_de_escrita_consulta_e_escreve(cliente, sessao):
    escrita = _bearer(_criar_chave(cliente, sessao, escopo="escrita").json()["segredo"])

    conta = cliente.post("/contas", json={"nome": "Nubank"}, headers=escrita)
    assert conta.status_code == 201
    gasto = cliente.post(
        "/gastos",
        json={
            "conta_id": conta.json()["id"],
            "valor": "10.00",
            "descricao": "Feira",
            "data": "2026-10-10",
            "categoria": "conforto",
        },
        headers=escrita,
    )

    assert gasto.status_code == 201
    assert [c["nome"] for c in cliente.get("/contas", headers=escrita).json()] == ["Nubank"]


def test_chave_expirada_devolve_401(cliente, sessao):
    expira_em = datetime.now(UTC) + timedelta(hours=1)
    segredo = _criar_chave(cliente, sessao, expira_em=expira_em.isoformat()).json()["segredo"]
    cliente.app.state.relogio = RelogioFixo(expira_em)

    resposta = cliente.get("/contas", headers=_bearer(segredo))

    _confere_erro(resposta, 401, "nao_autenticado")


def test_chave_com_prefixo_publico_trocado_devolve_401(cliente, sessao):
    segredo = _criar_chave(cliente, sessao).json()["segredo"]
    _, prefixo, aleatorio = segredo.split("_", 2)
    outro_prefixo = "Z" * 8 if prefixo != "Z" * 8 else "Y" * 8

    resposta = cliente.get("/contas", headers=_bearer(f"gapi_{outro_prefixo}_{aleatorio}"))

    _confere_erro(resposta, 401, "nao_autenticado")


@pytest.mark.parametrize("escopo", ["leitura", "escrita"])
def test_chave_de_api_nao_gerencia_chaves(cliente, sessao, escopo):
    criada = _criar_chave(cliente, sessao, escopo=escopo).json()
    chave = _bearer(criada["segredo"])

    _confere_erro(cliente.get("/chaves-de-api", headers=chave), 403, "acesso_negado")
    _confere_erro(_criar_chave(cliente, chave), 403, "acesso_negado")
    _confere_erro(
        cliente.delete(f"/chaves-de-api/{criada['id']}", headers=chave), 403, "acesso_negado"
    )
    assert len(cliente.get("/chaves-de-api", headers=sessao).json()) == 1
