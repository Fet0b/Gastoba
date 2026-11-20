"""D4 (069): definir e remover as caixinhas de um resgate ligado pela Revisão da bolsa."""

from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from gastoba.api.app import criar_app
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.portas import (
    ContaExterna,
    InvestimentoExterno,
    OperacaoExterna,
    TransacaoExterna,
)
from gastoba.domain.transacao_importada import SentidoDaTransacao
from gastoba.infrastructure.persistencia.banco import criar_engine
from gastoba.infrastructure.persistencia.modelos import Base
from gastoba.infrastructure.relogio_do_sistema import RelogioDoSistema
from gastoba.infrastructure.seguranca.hasher_de_senha_scrypt import HasherDeSenhaScrypt

DONO = "dono@x.com"
BRUTO = "LIQ BOLSA - VISTA BRUTO - PREGÃO: 03/11/2026 - EXEC.: 85 - V 46780"
SEM_ID = "00000000-0000-0000-0000-000000000000"


@pytest.fixture(autouse=True)
def relogio(monkeypatch):
    instante = datetime(2026, 11, 10, 15, tzinfo=UTC)
    monkeypatch.setattr(RelogioDoSistema, "agora", lambda self: instante)


class ProvedorFalso:
    def listar_contas(self, id_do_item):
        return [ContaExterna("c1", "Conta Corrente", Dinheiro(150000))]

    def listar_investimentos(self, id_do_item):
        return [
            InvestimentoExterno(
                "aupo11", "AUPO11", "EQUITY", "ETF", Dinheiro(369237), '{"quantity": "25"}'
            )
        ]

    def listar_operacoes_do_investimento(self, id_do_investimento):
        return [
            OperacaoExterna(
                "op1", "SELL", date(2026, 11, 3), "25", Dinheiro(278930), None, "CREDIT", None
            )
        ]

    def listar_faturas(self, id_da_conta):
        return []

    def listar_transacoes(self, id_da_conta, desde):
        entrada = SentidoDaTransacao.ENTRADA
        return [TransacaoExterna("t1", Dinheiro(278930), BRUTO, date(2026, 11, 5), entrada, None)]


@pytest.fixture
def cliente(configuracoes_teste):
    configuracoes = configuracoes_teste.model_copy(
        update={
            "pluggy_client_id": "id",
            "pluggy_client_secret": SecretStr("segredo"),
            "pluggy_item_ids": ["item-1"],
            "pluggy_email_do_dono": DONO,
            "pluggy_intervalo_horas": 0,
        }
    )
    engine = criar_engine(configuracoes.url_banco)
    Base.metadata.create_all(engine)
    engine.dispose()
    app = criar_app(configuracoes)
    app.state.hasher_de_senha = HasherDeSenhaScrypt(n=2, r=1, p=1)
    app.state.provedor_open_finance = ProvedorFalso()
    with TestClient(app, base_url="http://localhost") as cliente:
        yield cliente


@pytest.fixture
def dono(cliente, autenticar_em):
    quem = autenticar_em(cliente, email=DONO, nome="Dono")
    assert cliente.post("/sincronizacoes", headers=quem).status_code == 200
    return quem


@pytest.fixture
def resgate_ligado(cliente, dono):
    """Resgate criado pela Revisão da bolsa (sem partes), numa posição com a caixinha «casa»."""
    (proposta,) = cliente.get("/revisao-da-bolsa", headers=dono).json()["propostas"]
    assert (
        cliente.post(
            "/revisao-da-bolsa/confirmar",
            json={"itens": [{"chave": proposta["chave"], "versao": proposta["versao"]}]},
            headers=dono,
        ).status_code
        == 201
    )
    (posicao,) = cliente.get("/investimentos", headers=dono).json()
    inicial = cliente.post(
        f"/investimentos/{posicao['id']}/destinacoes",
        json={"destinacoes": [{"tag": "casa", "percentual": 100}]},
        headers=dono,
    )
    assert inicial.status_code == 201
    resgates = [
        m
        for m in cliente.get(
            "/movimentos-de-investimento",
            params={"inicio": "2026-01-01", "fim": "2026-12-31"},
            headers=dono,
        ).json()
        if m["tipo"] == "resgate"
    ]
    (resgate,) = resgates
    assert resgate["destinacoes"] == [] and resgate["casamento_id"]
    return posicao["id"], resgate["id"]


def _partes(cliente, quem, resgate_id):
    movimentos = cliente.get(
        "/movimentos-de-investimento",
        params={"inicio": "2026-01-01", "fim": "2026-12-31"},
        headers=quem,
    ).json()
    return next(m for m in movimentos if m["id"] == resgate_id)["destinacoes"]


def _definir(cliente, quem, posicao_id, resgate_id, **extra):
    return cliente.post(
        f"/movimentos-de-investimento/{resgate_id}/destinacoes",
        json={
            "investimento_id": posicao_id,
            "destinacoes": [{"tag": "casa", "percentual": 100}],
        },
        headers=quem,
        **extra,
    )


def test_define_e_remove_as_caixinhas_do_resgate(cliente, dono, resgate_ligado):
    posicao_id, resgate_id = resgate_ligado
    assert _definir(cliente, dono, posicao_id, resgate_id).status_code == 200
    (parte,) = _partes(cliente, dono, resgate_id)
    assert parte["tag"] == "casa"
    # Definir de novo é recusado como sempre.
    de_novo = _definir(cliente, dono, posicao_id, resgate_id)
    assert de_novo.status_code == 409
    assert de_novo.json()["erro"]["codigo"] == "movimento_ja_associado"
    remover = cliente.delete(f"/movimentos-de-investimento/{resgate_id}/caixinhas", headers=dono)
    assert remover.status_code == 204
    assert _partes(cliente, dono, resgate_id) == []
    # Sem partes, não há o que remover.
    de_novo = cliente.delete(f"/movimentos-de-investimento/{resgate_id}/caixinhas", headers=dono)
    assert de_novo.status_code == 409
    assert de_novo.json()["erro"]["codigo"] == "movimento_nao_desfazivel"


def test_outra_pessoa_nao_define_nem_remove(cliente, dono, resgate_ligado, autenticar_em):
    posicao_id, resgate_id = resgate_ligado
    outra = autenticar_em(cliente, email="outra@x.com", nome="Outra")
    assert _definir(cliente, outra, posicao_id, resgate_id).status_code == 404
    assert _definir(cliente, dono, posicao_id, resgate_id).status_code == 200
    remover = cliente.delete(f"/movimentos-de-investimento/{resgate_id}/caixinhas", headers=outra)
    assert remover.status_code == 404
    assert remover.json()["erro"]["codigo"] == "movimento_de_investimento_nao_encontrado"
    assert len(_partes(cliente, dono, resgate_id)) == 1


def test_remover_exige_sessao_e_csrf_no_cookie(cliente, dono, resgate_ligado):
    posicao_id, resgate_id = resgate_ligado
    assert _definir(cliente, dono, posicao_id, resgate_id).status_code == 200
    url = f"/movimentos-de-investimento/{resgate_id}/caixinhas"
    assert cliente.delete(url).status_code == 401
    for escopo in ("leitura", "escrita"):
        chave = cliente.post(
            "/chaves-de-api", json={"nome": "Teste", "escopo": escopo}, headers=dono
        ).json()
        headers = {"Authorization": f"Bearer {chave['segredo']}"}
        assert cliente.delete(url, headers=headers).status_code == 403
    token = dono["Authorization"].removeprefix("Bearer ")
    cliente.cookies.set("gastoba_sessao", token)
    sem_csrf = cliente.delete(url)
    assert sem_csrf.status_code == 403
    assert sem_csrf.json()["erro"]["codigo"] == "requisicao_invalida_origem"
    com_csrf = cliente.delete(url, headers={"X-Gastoba-Requisicao": "1"})
    assert com_csrf.status_code == 204
    cliente.cookies.clear()


def test_remover_com_compra_coberta_e_recusado(cliente, dono, resgate_ligado):
    posicao_id, resgate_id = resgate_ligado
    assert _definir(cliente, dono, posicao_id, resgate_id).status_code == 200
    (conta,) = [c for c in cliente.get("/contas", headers=dono).json()]
    compra = cliente.post(
        "/gastos",
        json={
            "conta_id": conta["id"],
            "valor": "30.00",
            "descricao": "Compra",
            "data": "2026-11-06",
            "categoria": "lazer",
        },
        headers=dono,
    )
    assert compra.status_code == 201
    cobertura = cliente.post(
        f"/gastos/{compra.json()['id']}/coberturas",
        json={"tag": "casa", "valor": "30.00", "movimento_id": resgate_id},
        headers=dono,
    )
    assert cobertura.status_code == 201
    remover = cliente.delete(f"/movimentos-de-investimento/{resgate_id}/caixinhas", headers=dono)
    assert remover.status_code == 409
    assert remover.json()["erro"]["codigo"] == "movimento_nao_desfazivel"
    assert len(_partes(cliente, dono, resgate_id)) == 1


def test_movimento_inexistente_e_404(cliente, dono):
    resposta = cliente.delete(f"/movimentos-de-investimento/{SEM_ID}/caixinhas", headers=dono)
    assert resposta.status_code == 404
