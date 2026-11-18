"""Exemplo da história: aporte vinculado, resgate tagueado, compra paga com a caixinha."""

from datetime import date
from uuid import UUID

import pytest

from gastoba.domain.destinacao import ParteDeDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


@pytest.fixture
def cenario(cliente_autenticado):
    c = cliente_autenticado
    dono = UUID(c.get("/auth/eu").json()["id"])
    conta = c.post("/contas", json={"nome": "Carteira fictícia", "saldo_inicial": "0.00"}).json()
    c.put("/renda-base", json={"valor": "5300.00"})
    c.put("/metas/conforto", json={"percentual": 18})  # limite R$ 954,00
    compra = c.post(
        "/gastos",
        json={
            "conta_id": conta["id"],
            "descricao": "Computador fictício",
            "valor": "4200.00",
            "data": "2026-11-05",
            "categoria": "conforto",
        },
    ).json()
    with UnidadeDeTrabalhoSqlAlchemy(c.app.state.fabrica_de_sessoes) as u:
        u.investimentos.salvar_posicao(
            dono,
            InvestimentoExterno("lci", "LCI fictícia", "FIXED_INCOME", None, Dinheiro(1), "{}"),
        )
        investimento = u.investimentos.listar_posicoes(dono)[0]

        def movimento(tipo, valor, dia, parte):
            m = MovimentoDeInvestimento(
                UUID(conta["id"]), tipo, Dinheiro(valor), "Movimento fictício", dia, investimento.id
            )
            u.movimentos_de_investimento.adicionar(m)
            u.destinacoes.adicionar(m.id, [parte])
            return m

        movimento(
            TipoDeMovimento.APORTE,
            350000,
            date(2026, 10, 10),
            ParteDeDestinacao(Tag("computador"), Dinheiro(350000)),
        )
        resgate = movimento(
            TipoDeMovimento.RESGATE,
            370000,
            date(2026, 11, 5),
            ParteDeDestinacao(Tag("computador"), Dinheiro(-370000), Dinheiro(-350000)),
        )
        u.commit()
    return c, compra, str(resgate.id)


def _meta(c, mes):
    metas = c.get("/metas/progresso", params={"mes": mes}).json()["metas"]
    return next(m for m in metas if m["categoria"] == "conforto")


def test_aporte_vinculado_nao_vira_despesa_da_categoria(cenario):
    c, _, _ = cenario
    assert _meta(c, "2026-10")["gasto"] == "0.00"
    assert _meta(c, "2026-10")["situacao"] == "dentro"


def test_compra_paga_com_a_caixinha_aumenta_o_limite_sem_estouro(cenario):
    c, compra, resgate = cenario
    r = c.post(
        f"/gastos/{compra['id']}/coberturas",
        json={"tag": "computador", "valor": "3700.00", "movimento_id": resgate},
    )
    assert r.status_code == 201
    assert r.json()["movimento_id"] == resgate
    meta = _meta(c, "2026-11")
    assert (meta["limite"], meta["gasto_bruto"], meta["limite_adicional"], meta["gasto"]) == (
        "954.00",
        "4200.00",
        "3700.00",
        "500.00",
    )
    assert meta["situacao"] == "dentro"
    assert [(k["tag"], k["valor"]) for k in meta["caixinhas"]] == [("computador", "3700.00")]


def test_recusas_e_isolamento(cenario, autenticar):
    c, compra, resgate = cenario
    url = f"/gastos/{compra['id']}/coberturas"
    sem_resgate = c.post(url, json={"tag": "computador", "valor": "10.00"})
    assert (sem_resgate.status_code, sem_resgate.json()["erro"]["codigo"]) == (
        422,
        "cobertura_invalida",
    )
    acima = c.post(url, json={"tag": "computador", "valor": "3700.01", "movimento_id": resgate})
    assert (acima.status_code, acima.json()["erro"]["codigo"]) == (422, "cobertura_invalida")
    outro = autenticar(email="outra-compra-ficticia@exemplo.com")
    assert (
        c.post(
            url,
            headers=outro,
            json={"tag": "computador", "valor": "1.00", "movimento_id": resgate},
        ).status_code
        == 404
    )
    chave = c.post("/chaves-de-api", json={"nome": "Chave fictícia", "escopo": "escrita"}).json()
    r = c.post(
        url,
        headers={"Authorization": f"Bearer {chave['segredo']}"},
        json={"tag": "computador", "valor": "1.00", "movimento_id": resgate},
    )
    assert r.status_code == 403


def test_desfazer_a_cobertura_devolve_o_limite(cenario):
    c, compra, resgate = cenario
    cobertura = c.post(
        f"/gastos/{compra['id']}/coberturas",
        json={"tag": "computador", "valor": "3700.00", "movimento_id": resgate},
    ).json()
    assert c.delete(f"/gastos/{compra['id']}/coberturas/{cobertura['id']}").status_code == 204
    meta = _meta(c, "2026-11")
    assert (meta["limite_adicional"], meta["gasto"]) == ("0.00", "4200.00")


def test_resgate_mostra_quanto_ja_foi_usado(cenario):
    c, compra, resgate = cenario
    c.post(
        f"/gastos/{compra['id']}/coberturas",
        json={"tag": "computador", "valor": "1000.00", "movimento_id": resgate},
    )
    movimentos = c.get(
        "/movimentos-de-investimento", params={"inicio": "2026-11-01", "fim": "2026-11-30"}
    ).json()
    parte = movimentos[0]["destinacoes"][0]
    assert (movimentos[0]["tipo"], parte["valor"], parte["coberto"]) == (
        "resgate",
        "3700.00",
        "1000.00",
    )
    aportes = c.get(
        "/movimentos-de-investimento", params={"inicio": "2026-10-01", "fim": "2026-10-31"}
    ).json()
    assert aportes[0]["destinacoes"][0]["categoria"] is None
    assert aportes[0]["destinacoes"][0]["coberto"] is None


def test_desfazer_resgate_remove_cobertura_so_com_confirmacao(cenario):
    from pydantic import SecretStr
    from sqlalchemy import update

    from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada
    from gastoba.infrastructure.persistencia.modelos import (
        ContaModelo,
        MovimentoDeInvestimentoModelo,
    )

    c, compra, resgate_id = cenario
    pessoa = c.get("/auth/eu").json()
    c.app.state.configuracoes = c.app.state.configuracoes.model_copy(
        update={
            "pluggy_client_id": "teste",
            "pluggy_client_secret": SecretStr("teste"),
            "pluggy_item_ids": ["item-teste"],
            "pluggy_email_do_dono": pessoa["email"],
        }
    )
    with UnidadeDeTrabalhoSqlAlchemy(c.app.state.fabrica_de_sessoes) as u:
        m = u.movimentos_de_investimento.obter(UUID(pessoa["id"]), UUID(resgate_id))
        t = TransacaoImportada(
            m.conta_id, "resgate-teste", m.data, m.descricao, m.valor, SentidoDaTransacao.ENTRADA
        )
        t.aceitar()
        u._sessao.execute(
            update(ContaModelo)
            .where(ContaModelo.id == m.conta_id)
            .values(origem="open_finance", id_externo="conta-teste")
        )
        u.transacoes_importadas.adicionar_se_nova(t)
        u._sessao.execute(
            update(MovimentoDeInvestimentoModelo)
            .where(MovimentoDeInvestimentoModelo.id == m.id)
            .values(transacao_importada_id=t.id)
        )
        u.commit()
    assert (
        c.post(
            f"/gastos/{compra['id']}/coberturas",
            json={
                "tag": "computador",
                "valor": "3700.00",
                "movimento_id": resgate_id,
            },
        ).status_code
        == 201
    )
    movimentos = c.get(
        "/movimentos-de-investimento",
        params={
            "inicio": "2026-11-01",
            "fim": "2026-11-30",
        },
    ).json()
    resgate = next(m for m in movimentos if m["id"] == resgate_id)
    url = f"/transacoes-importadas/{resgate['transacao_importada_id']}"
    previa = c.get(url + "/impacto-da-reversao").json()
    assert previa["coberturas_removidas"] == 1
    assert (
        c.post(
            url + "/desfazer-classificacao",
            json={
                "versao_esperada": previa["versao"],
            },
        ).status_code
        == 409
    )
    assert (
        c.post(
            url + "/desfazer-classificacao",
            json={
                "versao_esperada": previa["versao"],
                "desfazer_dependencias": True,
            },
        ).status_code
        == 200
    )
    gastos = c.get("/gastos", params={"inicio": "2026-11-01", "fim": "2026-11-30"}).json()
    assert next(g for g in gastos if g["id"] == compra["id"])["coberturas"] == []
