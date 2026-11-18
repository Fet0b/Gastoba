"""Revisão da bolsa: listar propostas, confirmar em lote e refazer ligações."""

import logging
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


CONFIRMAR = "/revisao-da-bolsa/confirmar"


def _proposta(cliente, quem):
    (p,) = cliente.get("/revisao-da-bolsa", headers=quem).json()["propostas"]
    return p


def _itens(p, **extra):
    return {"itens": [{"chave": p["chave"], "versao": p["versao"], **extra}]}


def test_le_a_proposta_exata_com_sinais_e_efeitos(cliente, dono):
    corpo = cliente.get("/revisao-da-bolsa", headers=dono).json()
    (p,) = corpo["propostas"]
    assert p["tipo"] == "compra_na_bolsa" and p["confianca"] == "exata"
    assert p["data_do_pregao"] == "2026-11-03"
    assert [o["valor_bruto"] for o in p["operacoes"]] == ["2789.30"]
    assert [t["valor"] for t in p["bruto"]] == ["2789.30"]
    assert sorted(t["valor"] for t in p["taxas"]) == ["0.13", "0.62"]
    assert p["diferenca"] == "0.00"
    assert p["diferenca_de_custo"] == "0.75"
    assert {e["codigo"] for e in p["efeitos"]} == {"aceita_a_pendente"}
    assert len(p["versao"]) == 64 and corpo["sem_par"] == [] and corpo["confirmados"] == []


def test_confirma_cria_o_aporte_ligado_e_a_revisao_esvazia(cliente, dono):
    p = _proposta(cliente, dono)
    resposta = cliente.post(CONFIRMAR, json=_itens(p), headers=dono)
    assert resposta.status_code == 201
    (ligado,) = resposta.json()["confirmados"]
    assert ligado["chave"] == p["chave"]
    movimentos = cliente.get(
        "/movimentos-de-investimento",
        params={"inicio": "2026-11-01", "fim": "2026-11-30"},
        headers=dono,
    ).json()
    (aporte,) = movimentos
    assert aporte["tipo"] == "aporte" and aporte["valor"] == "2789.30"
    assert aporte["casamento_id"] == ligado["casamento_id"]
    assert aporte["natureza"] == "liquidacao_de_bolsa"
    depois = cliente.get("/revisao-da-bolsa", headers=dono).json()
    assert depois["propostas"] == []
    (confirmado,) = depois["confirmados"]
    assert confirmado["id"] == ligado["casamento_id"] and confirmado["sem_aporte"] is False
    assert cliente.get(
        "/resumos/investimentos", params={"visao": "destinacao"}, headers=dono
    ).status_code in (200, 404)


def test_versao_desatualizada_da_409_e_nada_grava(cliente, dono):
    p = _proposta(cliente, dono)
    resposta = cliente.post(
        CONFIRMAR,
        json=_itens(p) | {"itens": [{**_itens(p)["itens"][0], "versao": "x" * 64}]},
        headers=dono,
    )
    assert resposta.status_code == 409
    assert resposta.json()["erro"]["codigo"] == "revisao_desatualizada"
    assert cliente.get("/casamentos", headers=dono).json() == []


def test_lista_vazia_ou_com_mais_de_cinquenta_itens_da_422(cliente, dono):
    assert cliente.post(CONFIRMAR, json={"itens": []}, headers=dono).status_code == 422
    item = {"chave": "a", "versao": "b"}
    assert cliente.post(CONFIRMAR, json={"itens": [item] * 51}, headers=dono).status_code == 422


def test_transacao_ligada_nao_pode_ser_desfeita_por_outra_rota(cliente, dono):
    p = _proposta(cliente, dono)
    cliente.post(CONFIRMAR, json=_itens(p), headers=dono)
    (aporte,) = cliente.get(
        "/movimentos-de-investimento",
        params={"inicio": "2026-11-01", "fim": "2026-11-30"},
        headers=dono,
    ).json()
    resposta = cliente.post(
        f"/movimentos-de-investimento/{aporte['id']}/desfazer-classificacao", json={}, headers=dono
    )
    assert resposta.status_code == 409
    assert resposta.json()["erro"]["codigo"] == "transacao_casada"


def test_desfazer_a_ligacao_devolve_as_transacoes_e_tira_o_aporte(cliente, dono):
    p = _proposta(cliente, dono)
    (ligado,) = cliente.post(CONFIRMAR, json=_itens(p), headers=dono).json()["confirmados"]
    assert cliente.delete(f"/casamentos/{ligado['casamento_id']}", headers=dono).status_code == 204
    assert (
        cliente.get(
            "/movimentos-de-investimento",
            params={"inicio": "2026-11-01", "fim": "2026-11-30"},
            headers=dono,
        ).json()
        == []
    )
    assert len(cliente.get("/revisao-da-bolsa", headers=dono).json()["propostas"]) == 1


def test_refazer_de_casamento_com_aporte_e_recusado_e_de_outro_usuario_e_404(
    cliente, dono, autenticar_em
):
    p = _proposta(cliente, dono)
    (ligado,) = cliente.post(CONFIRMAR, json=_itens(p), headers=dono).json()["confirmados"]
    url = f"/casamentos/{ligado['casamento_id']}/refazer"
    assert cliente.post(url, headers=dono).status_code == 409
    outra = autenticar_em(cliente, email="outra-refaz@x.com", nome="Outra")
    resposta = cliente.post(url, headers=outra)
    assert resposta.status_code == 404
    assert resposta.json()["erro"]["codigo"] == "casamento_nao_encontrado"


def _casamento_antigo(cliente, quem):
    """Uma ligação feita antes da 061: o casamento existe e as transações estão aceitas, mas
    nenhum aporte foi registrado. Semeada pelo repositório (não há mais rota para criá-la)."""
    from uuid import UUID

    from gastoba.domain.casamento_de_operacao import (
        CasamentoDeOperacao,
        PapelDoVinculo,
        VinculoDeCasamento,
    )
    from gastoba.infrastructure.persistencia.unidade_de_trabalho import (
        UnidadeDeTrabalhoSqlAlchemy,
    )

    p = _proposta(cliente, quem)
    usuario = UUID(cliente.get("/auth/eu", headers=quem).json()["id"])
    uow = UnidadeDeTrabalhoSqlAlchemy(cliente.app.state.fabrica_de_sessoes)
    vinculos = tuple(
        VinculoDeCasamento(
            UUID(t["id"]), PapelDoVinculo.BRUTO if t in p["bruto"] else PapelDoVinculo.TAXA
        )
        for t in p["bruto"] + p["taxas"]
    )
    casamento = CasamentoDeOperacao((UUID(p["operacoes"][0]["id"]),), vinculos)
    with uow as u:
        for v in vinculos:
            transacao = u.transacoes_importadas.obter(usuario, v.transacao_importada_id)
            transacao.aceitar()
            u.transacoes_importadas.atualizar_estado(transacao)
        u.casamentos.adicionar(usuario, casamento)
        u.commit()
    return str(casamento.id)


def test_refazer_ligacao_antiga_sem_aporte_cria_o_aporte(cliente, dono):
    antigo = _casamento_antigo(cliente, dono)
    revisao = cliente.get("/revisao-da-bolsa", headers=dono).json()
    assert revisao["confirmados"][0]["sem_aporte"] is True
    resposta = cliente.post(f"/casamentos/{antigo}/refazer", headers=dono)
    assert resposta.status_code == 200
    novo = resposta.json()["casamento_id"]
    assert novo != antigo
    (aporte,) = cliente.get(
        "/movimentos-de-investimento",
        params={"inicio": "2026-11-01", "fim": "2026-11-30"},
        headers=dono,
    ).json()
    assert aporte["casamento_id"] == novo and aporte["valor"] == "2789.30"
    assert (
        cliente.get("/revisao-da-bolsa", headers=dono).json()["confirmados"][0]["sem_aporte"]
        is False
    )


def test_outra_pessoa_nao_ve_nem_confirma_proposta_alheia(cliente, dono, autenticar_em):
    p = _proposta(cliente, dono)
    outra = autenticar_em(cliente, email="outra-bolsa@x.com", nome="Outra")
    assert cliente.get("/revisao-da-bolsa", headers=outra).json() == {
        "propostas": [],
        "sem_par": [],
        "confirmados": [],
    }
    resposta = cliente.post(CONFIRMAR, json=_itens(p), headers=outra)
    assert resposta.status_code == 409
    assert cliente.get("/casamentos", headers=dono).json() == []


def test_exige_sessao_e_recusa_chave_de_api_ate_no_get(cliente, dono):
    assert cliente.get("/revisao-da-bolsa").status_code == 401
    assert cliente.post(CONFIRMAR, json={"itens": []}).status_code == 401
    for escopo in ("leitura", "escrita"):
        chave = cliente.post(
            "/chaves-de-api", json={"nome": "Teste", "escopo": escopo}, headers=dono
        ).json()
        headers = {"Authorization": f"Bearer {chave['segredo']}"}
        assert cliente.get("/revisao-da-bolsa", headers=headers).status_code == 403
        item = {"chave": "a", "versao": "b"}
        assert cliente.post(CONFIRMAR, json={"itens": [item]}, headers=headers).status_code == 403
        uuid = "00000000-0000-0000-0000-000000000000"
        assert cliente.post(f"/casamentos/{uuid}/refazer", headers=headers).status_code == 403


def test_escrita_por_cookie_exige_o_cabecalho_de_csrf(cliente, dono):
    cookie = {"Cookie": "gastoba_sessao=" + dono["Authorization"].removeprefix("Bearer ")}
    p = _proposta(cliente, dono)
    sem = cliente.post(CONFIRMAR, json=_itens(p), headers=cookie)
    assert sem.status_code == 403
    assert sem.json()["erro"]["codigo"] == "requisicao_invalida_origem"
    com = cliente.post(CONFIRMAR, json=_itens(p), headers=cookie | {"X-Gastoba-Requisicao": "1"})
    assert com.status_code == 201
    uuid = "00000000-0000-0000-0000-000000000000"
    refazer = cliente.post(f"/casamentos/{uuid}/refazer", headers=cookie)
    assert refazer.status_code == 403
    assert refazer.json()["erro"]["codigo"] == "requisicao_invalida_origem"


def test_logs_das_rotas_nao_trazem_valores_descricoes_nem_ids(cliente, dono, caplog):
    caplog.set_level(logging.DEBUG)
    p = _proposta(cliente, dono)
    corpo = cliente.get("/revisao-da-bolsa", headers=dono).json()
    cliente.post(CONFIRMAR, json=_itens(p), headers=dono)
    proibidos = {
        "2789.30",
        "278930",
        "LIQ BOLSA",
        p["chave"],
        p["versao"],
        str(p["operacoes"][0]["id"]),
    }
    proibidos |= {t["id"] for t in p["bruto"] + p["taxas"]}
    texto = "\n".join(r.getMessage() for r in caplog.records)
    assert corpo and not [x for x in proibidos if x in texto]


def test_item_sem_par_diz_o_que_e(cliente, dono):
    """Uma operação da corretora sem débito na conta aparece com descrição, data e valor."""
    from decimal import Decimal
    from uuid import UUID

    from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
    from gastoba.infrastructure.persistencia.unidade_de_trabalho import (
        UnidadeDeTrabalhoSqlAlchemy,
    )

    usuario = UUID(cliente.get("/auth/eu", headers=dono).json()["id"])
    uow = UnidadeDeTrabalhoSqlAlchemy(cliente.app.state.fabrica_de_sessoes)
    p = _proposta(cliente, dono)
    with uow as u:
        u.operacoes.adicionar(
            usuario,
            Operacao(
                posicao_id=UUID(p["operacoes"][0]["posicao_id"]),
                tipo=TipoDeOperacao.COMPRA,
                data=date(2026, 10, 21),
                quantidade=Decimal("3"),
                valor_bruto=Dinheiro(45528),
                origem=OrigemDaOperacao.PLUGGY,
                id_externo="op-sem-lancamento",
            ),
        )
        u.commit()
    (item,) = cliente.get("/revisao-da-bolsa", headers=dono).json()["sem_par"]
    assert item["descricao"] == "Compra de AUPO11 (3)"
    assert item["data"] == "2026-10-21" and item["valor"] == "455.28"
    assert item["operacao_id"] and item["transacao_id"] is None
