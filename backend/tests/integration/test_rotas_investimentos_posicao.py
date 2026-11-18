"""GET /investimentos: posição pelas operações (quantidade, custo médio, rentabilidade honesta)."""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from gastoba.api.app import criar_app
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.portas import ContaExterna, InvestimentoExterno
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
                "aupo11",
                "AUPO11",
                "EQUITY",
                "ETF",
                Dinheiro(369237),
                '{"quantity": "25"}',
            )
        ]

    def listar_transacoes(self, id_da_conta, desde):
        return []

    def listar_faturas(self, id_da_conta):
        return []

    def listar_operacoes_do_investimento(self, id_do_investimento):
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


def test_sem_operacoes_mostra_a_pendencia_e_nenhuma_rentabilidade(cliente, dono):
    (investimento,) = cliente.get("/investimentos", headers=dono).json()
    assert investimento["quantidade"] == "25"
    assert investimento["custo_medio"] is None
    assert investimento["historico_completo"] is False
    assert investimento["rentabilidade_do_periodo"] is None
    assert investimento["rentabilidade_anualizada"] is None
    assert investimento["motivo_sem_rentabilidade"] == "historico_incompleto"
    assert investimento["pendencias"] == [{"tipo": "faltam_cotas", "quantidade_estimada": "25"}]


def test_campos_antigos_continuam_no_contrato(cliente, dono):
    (investimento,) = cliente.get("/investimentos", headers=dono).json()
    for campo in (
        "id",
        "nome",
        "tipo",
        "saldo",
        "valor_aplicado",
        "rendimento",
        "rentabilidade",
        "origem_da_rentabilidade",
        "destinacoes",
    ):
        assert campo in investimento
    assert investimento["saldo"] == "3692.37"


def test_outra_pessoa_nao_ve_a_posicao_do_dono(cliente, dono, autenticar_em):
    outra = autenticar_em(cliente, email="outra@x.com", nome="Outra")
    assert cliente.get("/investimentos", headers=outra).json() == []


def test_exige_credencial(cliente):
    assert cliente.get("/investimentos").status_code == 401


def test_traz_o_rotulo_normalizado(cliente, dono):
    (investimento,) = cliente.get("/investimentos", headers=dono).json()
    assert investimento["rotulo"] == "AUPO11"
