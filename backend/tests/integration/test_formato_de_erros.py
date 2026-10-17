"""Um teste por linha da tabela de erros do plano: todo erro sai como ``{"erro": {...}}``."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from gastoba.api.app import criar_app
from gastoba.domain.excecoes import ErroDeDominio
from gastoba.infrastructure.persistencia.banco import criar_engine
from gastoba.infrastructure.persistencia.modelos import Base

ORIGEM_PERMITIDA = "http://localhost:5173"


class ErroDeDominioAvulso(ErroDeDominio):
    """Exceção de domínio sem código próprio na tabela de erros."""


def _levantar_erro_de_dominio() -> dict[str, str]:
    raise ErroDeDominioAvulso("Regra de negócio violada.")


def _levantar_erro_inesperado() -> dict[str, str]:
    raise RuntimeError("segredo")


def _confere_formato(resposta, status_code: int, codigo: str) -> dict:
    assert resposta.status_code == status_code
    assert "detail" not in resposta.text
    assert "Traceback" not in resposta.text
    corpo = resposta.json()
    assert set(corpo) == {"erro"}
    assert corpo["erro"]["codigo"] == codigo
    assert isinstance(corpo["erro"]["mensagem"], str)
    assert corpo["erro"]["mensagem"]
    return corpo["erro"]


def _criar_conta(cliente_autenticado, nome: str = "Nubank") -> str:
    resposta = cliente_autenticado.post("/contas", json={"nome": nome, "saldo_inicial": "100.00"})
    assert resposta.status_code == 201
    return resposta.json()["id"]


def _corpo_de_gasto(conta_id, **campos) -> dict:
    corpo = {
        "conta_id": str(conta_id),
        "valor": "10.00",
        "descricao": "Compras",
        "data": "2026-10-10",
        "categoria": "conforto",
        "tags": [],
    }
    corpo.update(campos)
    return corpo


@pytest.fixture
def cliente_com_rotas_de_erro(configuracoes_teste):
    # Mesmo preparo da fixture `cliente_autenticado`, mais rotas que levantam erros não alcançáveis
    # pelas rotas reais.
    engine = criar_engine(configuracoes_teste.url_banco)
    Base.metadata.create_all(engine)
    engine.dispose()
    app = criar_app(configuracoes_teste)
    app.add_api_route("/teste/erro-de-dominio", _levantar_erro_de_dominio)
    app.add_api_route("/teste/erro-inesperado", _levantar_erro_inesperado)
    with TestClient(app, base_url="http://localhost", raise_server_exceptions=False) as c:
        yield c


def test_conta_nao_encontrada(cliente_autenticado):
    resposta = cliente_autenticado.post("/gastos", json=_corpo_de_gasto(uuid4()))

    _confere_formato(resposta, 404, "conta_nao_encontrada")


def test_conta_ja_existe(cliente_autenticado):
    _criar_conta(cliente_autenticado)

    resposta = cliente_autenticado.post("/contas", json={"nome": "Nubank"})

    _confere_formato(resposta, 409, "conta_ja_existe")


def test_periodo_invalido(cliente_autenticado):
    resposta = cliente_autenticado.get(
        "/gastos", params={"inicio": "2026-10-31", "fim": "2026-10-01"}
    )

    _confere_formato(resposta, 422, "periodo_invalido")


def test_valor_invalido(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)

    resposta = cliente_autenticado.post("/gastos", json=_corpo_de_gasto(conta_id, valor="0.00"))

    _confere_formato(resposta, 422, "valor_invalido")


def test_descricao_invalida(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)

    resposta = cliente_autenticado.post("/gastos", json=_corpo_de_gasto(conta_id, descricao=""))

    _confere_formato(resposta, 422, "descricao_invalida")


def test_nome_invalido(cliente_autenticado):
    resposta = cliente_autenticado.post("/contas", json={"nome": ""})

    _confere_formato(resposta, 422, "nome_invalido")


def test_tag_invalida(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)

    resposta = cliente_autenticado.post("/gastos", json=_corpo_de_gasto(conta_id, tags=["x" * 31]))

    _confere_formato(resposta, 422, "tag_invalida")


def test_erro_de_dominio_generico(cliente_com_rotas_de_erro):
    resposta = cliente_com_rotas_de_erro.get("/teste/erro-de-dominio")

    erro = _confere_formato(resposta, 422, "erro_de_dominio")
    assert erro["mensagem"] == "Regra de negócio violada."


def test_requisicao_invalida_traz_detalhes_sem_ecoar_a_entrada(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)

    resposta = cliente_autenticado.post("/gastos", json=_corpo_de_gasto(conta_id, valor=25.9))

    erro = _confere_formato(resposta, 422, "requisicao_invalida")
    assert erro["detalhes"]
    for detalhe in erro["detalhes"]:
        assert set(detalhe) == {"campo", "mensagem"}
        assert "input" not in detalhe
    assert any(detalhe["campo"] == "body.valor" for detalhe in erro["detalhes"])
    assert "25.9" not in resposta.text


def test_erro_interno_nao_expoe_detalhes(cliente_com_rotas_de_erro):
    resposta = cliente_com_rotas_de_erro.get("/teste/erro-inesperado")

    _confere_formato(resposta, 500, "erro_interno")
    assert resposta.json() == {"erro": {"codigo": "erro_interno", "mensagem": "Erro interno."}}
    assert "segredo" not in resposta.text
    assert "RuntimeError" not in resposta.text


def test_erro_interno_chega_sem_cabecalho_de_cors(cliente_com_rotas_de_erro):
    # Comportamento aceito por ora: o ServerErrorMiddleware fica por fora do CORSMiddleware.
    resposta = cliente_com_rotas_de_erro.get(
        "/teste/erro-inesperado", headers={"Origin": ORIGEM_PERMITIDA}
    )

    _confere_formato(resposta, 500, "erro_interno")
    assert "access-control-allow-origin" not in resposta.headers
