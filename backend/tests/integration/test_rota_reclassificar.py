"""POST /transacoes-importadas/{id}/reclassificar: troca a classificação numa só transação."""

from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from gastoba.api.app import criar_app
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.portas import ContaExterna, InvestimentoExterno, TransacaoExterna
from gastoba.domain.transacao_importada import SentidoDaTransacao
from gastoba.infrastructure.persistencia.banco import criar_engine
from gastoba.infrastructure.persistencia.modelos import Base
from gastoba.infrastructure.relogio_do_sistema import RelogioDoSistema
from gastoba.infrastructure.seguranca.hasher_de_senha_scrypt import HasherDeSenhaScrypt

DONO = "dono@x.com"
DIA = date(2026, 10, 26)


@pytest.fixture(autouse=True)
def relogio(monkeypatch):
    instante = datetime(2026, 11, 10, 15, tzinfo=UTC)
    monkeypatch.setattr(RelogioDoSistema, "agora", lambda self: instante)


class ProvedorFalso:
    def listar_contas(self, id_do_item):
        return [ContaExterna("c1", "Conta Corrente", Dinheiro(150000))]

    def listar_investimentos(self, id_do_item):
        return [InvestimentoExterno("cdb", "CDB", "FIXED_INCOME", "CDB", Dinheiro(5000), "{}")]

    def listar_operacoes_do_investimento(self, id_do_investimento):
        return []

    def listar_faturas(self, id_da_conta):
        return []

    def listar_transacoes(self, id_da_conta, desde):
        entrada = SentidoDaTransacao.ENTRADA
        return [
            TransacaoExterna("t1", Dinheiro(2803), "Credito CDB", DIA, entrada, None),
            TransacaoExterna("t2", Dinheiro(2590), "Mercado", DIA, SentidoDaTransacao.SAIDA, "PIX"),
        ]


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


def _id_da_entrada(cliente, quem):
    return next(
        t["id"]
        for t in cliente.get("/transacoes-importadas", headers=quem).json()
        if t["descricao"] == "Credito CDB"
    )


def _aceitar_como_ganho(cliente, quem):
    transacao_id = _id_da_entrada(cliente, quem)
    resposta = cliente.post(
        f"/transacoes-importadas/{transacao_id}/aceitar", json={"tags": []}, headers=quem
    )
    assert resposta.status_code == 201 and resposta.json()["tipo"] == "ganho"
    return transacao_id


def _versao(cliente, quem, transacao_id):
    return cliente.get(
        f"/transacoes-importadas/{transacao_id}/impacto-da-reversao", headers=quem
    ).json()["versao"]


def test_rendimento_aceito_como_ganho_vira_rendimento_da_posicao(cliente, dono):
    transacao_id = _aceitar_como_ganho(cliente, dono)
    cdb = cliente.get("/investimentos", headers=dono).json()[0]["id"]
    assert len(cliente.get("/ganhos?inicio=2026-10-01&fim=2026-10-31", headers=dono).json()) == 1
    resposta = cliente.post(
        f"/transacoes-importadas/{transacao_id}/reclassificar",
        json={
            "rotulo": "rendimento_da_posicao",
            "investimento_id": cdb,
            "versao_esperada": _versao(cliente, dono, transacao_id),
        },
        headers=dono,
    )
    assert resposta.status_code == 200
    assert resposta.json()["tipo"] == "rendimento"
    assert cliente.get("/ganhos?inicio=2026-10-01&fim=2026-10-31", headers=dono).json() == []


def test_versao_desatualizada_nao_altera_nada(cliente, dono):
    transacao_id = _aceitar_como_ganho(cliente, dono)
    cdb = cliente.get("/investimentos", headers=dono).json()[0]["id"]
    resposta = cliente.post(
        f"/transacoes-importadas/{transacao_id}/reclassificar",
        json={
            "rotulo": "rendimento_da_posicao",
            "investimento_id": cdb,
            "versao_esperada": "velha",
        },
        headers=dono,
    )
    assert resposta.status_code == 409
    assert resposta.json()["erro"]["codigo"] == "movimento_nao_desfazivel"
    assert len(cliente.get("/ganhos?inicio=2026-10-01&fim=2026-10-31", headers=dono).json()) == 1


def test_rotulo_invalido_e_investimento_ausente_dao_422(cliente, dono):
    transacao_id = _aceitar_como_ganho(cliente, dono)
    versao = _versao(cliente, dono, transacao_id)
    for corpo in (
        {"rotulo": "inventado", "versao_esperada": versao},
        {"rotulo": "rendimento_da_posicao", "versao_esperada": versao},
    ):
        resposta = cliente.post(
            f"/transacoes-importadas/{transacao_id}/reclassificar", json=corpo, headers=dono
        )
        assert resposta.status_code == 422


def test_outra_pessoa_e_chave_de_api_nao_reclassificam(cliente, dono, autenticar_em):
    transacao_id = _aceitar_como_ganho(cliente, dono)
    corpo = {"rotulo": "ganho", "versao_esperada": "x"}
    outra = autenticar_em(cliente, email="outra@x.com", nome="Outra")
    assert (
        cliente.post(
            f"/transacoes-importadas/{transacao_id}/reclassificar", json=corpo, headers=outra
        ).status_code
        == 404
    )
    chave = cliente.post(
        "/chaves-de-api", json={"nome": "Teste", "escopo": "escrita"}, headers=dono
    ).json()
    headers = {"Authorization": f"Bearer {chave['segredo']}"}
    resposta = cliente.post(
        f"/transacoes-importadas/{transacao_id}/reclassificar", json=corpo, headers=headers
    )
    assert resposta.status_code == 403
    assert (
        cliente.post(f"/transacoes-importadas/{transacao_id}/reclassificar", json=corpo).status_code
        == 401
    )
