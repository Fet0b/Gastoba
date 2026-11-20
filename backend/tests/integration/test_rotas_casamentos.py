"""Casamento da liquidação da bolsa com a operação da corretora: listar e desfazer."""

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
BRUTO = "LIQ BOLSA - VISTA BRUTO - PREGÃO: 03/11/2026 - EXEC.: 85 - S 46780"
TAXA = "LIQ BOLSA - VISTA TX CCP/EMOL/TTA B3"


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
                "op1", "BUY", date(2026, 11, 3), "25", Dinheiro(278930), None, "CREDIT", None
            )
        ]

    def listar_faturas(self, id_da_conta):
        return []

    def listar_transacoes(self, id_da_conta, desde):
        saida = SentidoDaTransacao.SAIDA
        dia = date(2026, 11, 5)
        return [
            TransacaoExterna("t1", Dinheiro(278930), BRUTO, dia, saida, None),
            TransacaoExterna("t2", Dinheiro(62), TAXA, dia, saida, None),
            TransacaoExterna("t3", Dinheiro(13), TAXA, dia, saida, None),
            TransacaoExterna("t4", Dinheiro(2590), "Mercado", dia, saida, "PIX"),
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


def _caixa(cliente, quem):
    return {t["descricao"]: t for t in cliente.get("/transacoes-importadas", headers=quem).json()}


def _ligar(cliente, quem):
    """Liga a proposta de bolsa pela Revisão da bolsa e devolve o id do casamento."""
    (proposta,) = cliente.get("/revisao-da-bolsa", headers=quem).json()["propostas"]
    resposta = cliente.post(
        "/revisao-da-bolsa/confirmar",
        json={"itens": [{"chave": proposta["chave"], "versao": proposta["versao"]}]},
        headers=quem,
    )
    assert resposta.status_code == 201
    return resposta.json()["confirmados"][0]["casamento_id"]


def test_lista_o_casamento_e_desfazer_devolve_tudo(cliente, dono):
    casamento_id = _ligar(cliente, dono)
    (listado,) = cliente.get("/casamentos", headers=dono).json()
    assert listado["id"] == casamento_id and len(listado["operacao_ids"]) == 1
    assert len(listado["vinculos"]) == 3 and "operacao_id" not in listado
    assert [t["descricao"] for t in cliente.get("/transacoes-importadas", headers=dono).json()] == [
        "Mercado"
    ]
    assert cliente.delete(f"/casamentos/{casamento_id}", headers=dono).status_code == 204
    assert len(cliente.get("/transacoes-importadas", headers=dono).json()) == 4
    assert cliente.get("/casamentos", headers=dono).json() == []


def test_outra_pessoa_nao_ve_nem_desfaz(cliente, dono, autenticar_em):
    casamento_id = _ligar(cliente, dono)
    outra = autenticar_em(cliente, email="outra@x.com", nome="Outra")
    assert cliente.get("/casamentos", headers=outra).json() == []
    apagar = cliente.delete(f"/casamentos/{casamento_id}", headers=outra)
    assert apagar.status_code == 404
    assert apagar.json()["erro"]["codigo"] == "casamento_nao_encontrado"
    assert len(cliente.get("/casamentos", headers=dono).json()) == 1


def test_exige_sessao_e_recusa_chave_de_api(cliente, dono):
    assert cliente.get("/casamentos").status_code == 401
    assert cliente.get("/reaplicacoes/sugestoes").status_code == 401
    for escopo in ("leitura", "escrita"):
        chave = cliente.post(
            "/chaves-de-api", json={"nome": "Teste", "escopo": escopo}, headers=dono
        ).json()
        headers = {"Authorization": f"Bearer {chave['segredo']}"}
        assert cliente.get("/casamentos", headers=headers).status_code == 403
        assert cliente.get("/reaplicacoes/sugestoes", headers=headers).status_code == 403
        uuid = "00000000-0000-0000-0000-000000000000"
        assert cliente.delete(f"/casamentos/{uuid}", headers=headers).status_code == 403


def test_sugestoes_de_reaplicacao_sao_isoladas(cliente, dono, autenticar_em):
    outra = autenticar_em(cliente, email="outro-lista@x.com", nome="Outra")
    assert cliente.get("/reaplicacoes/sugestoes", headers=outra).json() == []


# --- 069 (D6): a liquidação bruta não é gasto nem ganho comum ---


def _liquidacao_recusada(resposta):
    assert resposta.status_code == 422
    assert resposta.json()["erro"]["codigo"] == "transacao_importada_invalida"
    assert "Revisão da bolsa" in resposta.json()["erro"]["mensagem"]


def test_aceitar_como_gasto_e_recusado_e_continua_pendente(cliente, dono):
    bruto = _caixa(cliente, dono)[BRUTO]
    _liquidacao_recusada(
        cliente.post(
            f"/transacoes-importadas/{bruto['id']}/aceitar",
            json={"categoria": "lazer", "tags": []},
            headers=dono,
        )
    )
    assert BRUTO in _caixa(cliente, dono)


def test_lote_com_uma_liquidacao_e_recusado_inteiro(cliente, dono):
    caixa = _caixa(cliente, dono)
    ids = [caixa[BRUTO]["id"], caixa["Mercado"]["id"]]
    _liquidacao_recusada(
        cliente.post(
            "/transacoes-importadas/aceitar-em-lote",
            json={"transacao_ids": ids, "categoria": "lazer", "tags": []},
            headers=dono,
        )
    )
    assert "Mercado" in _caixa(cliente, dono)


def test_dividir_com_parte_de_gasto_e_recusado(cliente, dono):
    bruto = _caixa(cliente, dono)[BRUTO]
    _liquidacao_recusada(
        cliente.post(
            f"/transacoes-importadas/{bruto['id']}/dividir",
            json={
                "partes": [
                    {"categoria": "lazer", "tags": [], "percentual": 50},
                    {"categoria": "conforto", "tags": [], "percentual": 50},
                ]
            },
            headers=dono,
        )
    )
    assert BRUTO in _caixa(cliente, dono)


def test_como_investimento_continua_aceito(cliente, dono):
    bruto = _caixa(cliente, dono)[BRUTO]
    resposta = cliente.post(
        f"/transacoes-importadas/{bruto['id']}/aceitar",
        json={"como_investimento": True},
        headers=dono,
    )
    assert resposta.status_code == 201


def test_outra_pessoa_nao_alcanca_a_transacao(cliente, dono, autenticar_em):
    bruto = _caixa(cliente, dono)[BRUTO]
    outra = autenticar_em(cliente, email="outra@x.com", nome="Outra")
    resposta = cliente.post(
        f"/transacoes-importadas/{bruto['id']}/aceitar",
        json={"categoria": "lazer", "tags": []},
        headers=outra,
    )
    assert resposta.status_code == 404
    assert BRUTO in _caixa(cliente, dono)


# --- 069 (T022): trocar o gasto antigo da liquidação pela ligação ---


def _gasto_antigo_da_liquidacao(cliente, quem):
    """O estado antigo: a liquidação bruta aceita como gasto (a regra D6 hoje o recusa; a pessoa
    o tinha antes dela), feito direto pelo repositório."""
    from uuid import UUID

    from gastoba.domain.categoria import CategoriaDoGasto
    from gastoba.domain.gasto import Gasto
    from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy

    usuario = UUID(cliente.get("/auth/eu", headers=quem).json()["id"])
    bruto = _caixa(cliente, quem)[BRUTO]
    uow = UnidadeDeTrabalhoSqlAlchemy(cliente.app.state.fabrica_de_sessoes)
    with uow as u:
        transacao = u.transacoes_importadas.obter(usuario, UUID(bruto["id"]))
        gasto = Gasto(
            transacao.conta_id,
            transacao.valor,
            transacao.descricao,
            transacao.data,
            CategoriaDoGasto.LAZER,
            (),
        )
        gasto.transacao_importada_id = transacao.id
        transacao.aceitar()
        u.transacoes_importadas.atualizar_estado(transacao)
        u.gastos.adicionar(gasto)
        u.commit()
    return bruto["id"]


def test_trocar_o_gasto_pela_ligacao_so_da_dona_e_so_por_sessao(cliente, dono, autenticar_em):
    transacao_id = _gasto_antigo_da_liquidacao(cliente, dono)
    url = f"/revisao-da-bolsa/trocar-gasto/{transacao_id}"
    assert cliente.post(url).status_code == 401
    chave = cliente.post(
        "/chaves-de-api", json={"nome": "Teste", "escopo": "escrita"}, headers=dono
    ).json()
    assert (
        cliente.post(url, headers={"Authorization": f"Bearer {chave['segredo']}"}).status_code
        == 403
    )
    outra = autenticar_em(cliente, email="outra@x.com", nome="Outra")
    achada = cliente.post(url, headers=outra)
    assert achada.status_code == 404
    assert achada.json()["erro"]["codigo"] == "transacao_importada_nao_encontrada"
    resposta = cliente.post(url, headers=dono)
    assert resposta.status_code == 201, resposta.text
    assert resposta.json()["casamento_id"]
    assert len(cliente.get("/casamentos", headers=dono).json()) == 1


def test_trocar_sem_gasto_antigo_e_recusado(cliente, dono):
    bruto = _caixa(cliente, dono)[BRUTO]
    resposta = cliente.post(f"/revisao-da-bolsa/trocar-gasto/{bruto['id']}", headers=dono)
    assert resposta.status_code == 409
    assert resposta.json()["erro"]["codigo"] == "movimento_nao_desfazivel"


def test_a_caixa_marca_a_liquidacao_da_bolsa(cliente, dono):
    caixa = _caixa(cliente, dono)
    assert caixa[BRUTO]["liquidacao_de_bolsa"] is True
    assert caixa["Mercado"]["liquidacao_de_bolsa"] is False
