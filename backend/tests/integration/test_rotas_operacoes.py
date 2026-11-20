"""Operações de investimento: lançar à mão, editar e excluir a abertura e as manuais."""

from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from gastoba.api.app import criar_app
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.portas import ContaExterna, InvestimentoExterno, OperacaoExterna
from gastoba.infrastructure.persistencia.banco import criar_engine
from gastoba.infrastructure.persistencia.modelos import Base
from gastoba.infrastructure.relogio_do_sistema import RelogioDoSistema
from gastoba.infrastructure.seguranca.hasher_de_senha_scrypt import HasherDeSenhaScrypt

DONO = "dono@x.com"


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
                "p1", "BUY", date(2026, 11, 3), "10", Dinheiro(100000), None, "CREDIT", None
            )
        ]

    def listar_faturas(self, id_da_conta):
        return []

    def listar_transacoes(self, id_da_conta, desde):
        return []


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


def _acao(cliente, quem):
    return cliente.get("/investimentos", headers=quem).json()[0]["id"]


def _corpo(**mudancas):
    base = {"tipo": "COMPRA", "data": "2026-11-04", "quantidade": "15", "valor": "1789.30"}
    base.update(mudancas)
    return base


def test_lista_a_da_corretora_como_imutavel(cliente, dono):
    (operacao,) = cliente.get(
        f"/investimentos/{_acao(cliente, dono)}/operacoes", headers=dono
    ).json()
    assert operacao["origem"] == "pluggy" and operacao["editavel"] is False
    assert operacao["quantidade"] == "10" and operacao["valor"] == "1000.00"


def test_lancar_a_compra_que_faltava_fecha_o_historico(cliente, dono):
    acao = _acao(cliente, dono)
    antes = cliente.get("/investimentos", headers=dono).json()[0]
    assert antes["historico_completo"] is False
    assert antes["pendencias"] == [{"tipo": "faltam_cotas", "quantidade_estimada": "15"}]
    criada = cliente.post(f"/investimentos/{acao}/operacoes", json=_corpo(), headers=dono)
    assert criada.status_code == 201
    assert criada.json()["origem"] == "manual" and criada.json()["editavel"] is True
    depois = cliente.get("/investimentos", headers=dono).json()[0]
    assert depois["historico_completo"] is True
    assert depois["pendencias"] == []
    assert depois["rentabilidade_do_periodo"] is not None


def test_a_da_corretora_nao_se_altera_nem_exclui(cliente, dono):
    acao = _acao(cliente, dono)
    (da_corretora,) = cliente.get(f"/investimentos/{acao}/operacoes", headers=dono).json()
    for resposta in (
        cliente.put(f"/operacoes/{da_corretora['id']}", json={"quantidade": "1"}, headers=dono),
        cliente.delete(f"/operacoes/{da_corretora['id']}", headers=dono),
    ):
        assert resposta.status_code == 409
        assert resposta.json()["erro"]["codigo"] == "operacao_da_corretora_imutavel"


def test_edita_e_exclui_a_manual(cliente, dono):
    acao = _acao(cliente, dono)
    criada = cliente.post(f"/investimentos/{acao}/operacoes", json=_corpo(), headers=dono).json()
    editada = cliente.put(
        f"/operacoes/{criada['id']}", json={"quantidade": "14.5", "valor": "1700.00"}, headers=dono
    )
    assert editada.status_code == 200
    assert editada.json()["quantidade"] == "14.5" and editada.json()["valor"] == "1700.00"
    assert cliente.delete(f"/operacoes/{criada['id']}", headers=dono).status_code == 204
    assert len(cliente.get(f"/investimentos/{acao}/operacoes", headers=dono).json()) == 1


def test_possivel_duplicidade_pede_confirmacao(cliente, dono):
    acao = _acao(cliente, dono)
    igual = _corpo(data="2026-11-03", quantidade="10", valor="1000.00")
    recusada = cliente.post(f"/investimentos/{acao}/operacoes", json=igual, headers=dono)
    assert recusada.status_code == 409
    assert recusada.json()["erro"]["codigo"] == "operacao_possivelmente_duplicada"
    confirmada = cliente.post(
        f"/investimentos/{acao}/operacoes",
        json={**igual, "confirmar_duplicidade": True},
        headers=dono,
    )
    assert confirmada.status_code == 201


def test_dados_invalidos_dao_422(cliente, dono):
    acao = _acao(cliente, dono)
    for corpo in (
        _corpo(tipo="INVENTADO"),
        _corpo(quantidade="abc"),
        _corpo(valor="-1.00"),
        _corpo(tipo="ABERTURA"),
        _corpo(tipo="TAXA"),
    ):
        resposta = cliente.post(f"/investimentos/{acao}/operacoes", json=corpo, headers=dono)
        assert resposta.status_code == 422, corpo


def test_outra_pessoa_e_chave_de_api_nao_mexem(cliente, dono, autenticar_em):
    acao = _acao(cliente, dono)
    criada = cliente.post(f"/investimentos/{acao}/operacoes", json=_corpo(), headers=dono).json()
    outra = autenticar_em(cliente, email="outra@x.com", nome="Outra")
    assert cliente.get(f"/investimentos/{acao}/operacoes", headers=outra).status_code == 404
    assert (
        cliente.post(f"/investimentos/{acao}/operacoes", json=_corpo(), headers=outra).status_code
        == 404
    )
    assert (
        cliente.put(
            f"/operacoes/{criada['id']}", json={"quantidade": "1"}, headers=outra
        ).status_code
        == 404
    )
    assert cliente.delete(f"/operacoes/{criada['id']}", headers=outra).status_code == 404
    chave = cliente.post(
        "/chaves-de-api", json={"nome": "T", "escopo": "escrita"}, headers=dono
    ).json()
    headers = {"Authorization": f"Bearer {chave['segredo']}"}
    assert cliente.get(f"/investimentos/{acao}/operacoes", headers=headers).status_code == 403
    assert cliente.delete(f"/operacoes/{criada['id']}", headers=headers).status_code == 403
    assert cliente.get(f"/investimentos/{acao}/operacoes").status_code == 401
