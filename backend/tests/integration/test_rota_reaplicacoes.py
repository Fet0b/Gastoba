from datetime import date
from uuid import UUID

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.portas import InvestimentoExterno
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


def preparar(cliente):
    pessoa = UUID(cliente.get("/auth/eu").json()["id"])
    conta = cliente.post(
        "/contas", json={"nome": "Carteira fictícia", "saldo_inicial": "1234.56"}
    ).json()
    uow = UnidadeDeTrabalhoSqlAlchemy(cliente.app.state.fabrica_de_sessoes)
    with uow as u:
        for codigo in ["origem", "destino"]:
            u.investimentos.salvar_posicao(
                pessoa,
                InvestimentoExterno(codigo, codigo, "FIXED_INCOME", None, Dinheiro(10000), "{}"),
            )
        u.commit()
    with uow as u:
        origem, destino = u.investimentos.listar_posicoes(pessoa)
        resgate = MovimentoDeInvestimento(
            UUID(conta["id"]),
            TipoDeMovimento.RESGATE,
            Dinheiro(10000),
            "Resgate fictício",
            date(2026, 10, 31),
            origem.id,
        )
        aporte = MovimentoDeInvestimento(
            UUID(conta["id"]),
            TipoDeMovimento.APORTE,
            Dinheiro(15000),
            "Aporte fictício",
            date(2026, 11, 1),
            destino.id,
        )
        for m in [resgate, aporte]:
            u.movimentos_de_investimento.adicionar(m)
        u.commit()
    cliente.put("/renda-base", json={"valor": "1000.00"})
    cliente.put("/metas/liberdade_financeira", json={"percentual": 25})
    return resgate, aporte


def test_confirma_lista_isola_e_remove_sem_mudar_saldos(cliente_autenticado, autenticar):
    c = cliente_autenticado
    resgate, aporte = preparar(c)
    antes = c.get("/contas").json()
    candidatos = c.get(f"/movimentos-de-investimento/{aporte.id}/resgates-para-reaplicar")
    assert candidatos.status_code == 200
    assert [x["id"] for x in candidatos.json()] == [str(resgate.id)]
    assert candidatos.json()[0]["disponivel"] == "100.00"
    corpo = {"aporte_id": str(aporte.id), "resgate_id": str(resgate.id), "valor": "100.00"}
    r = c.post("/reaplicacoes-de-resgates", json=corpo)
    assert r.status_code == 201, r.text
    id = r.json()["id"]
    assert c.get("/metas/progresso?mes=2026-11").json()["metas"][0]["gasto"] == "50.00"
    assert len(c.get("/reaplicacoes-de-resgates").json()) == 1
    assert c.post("/reaplicacoes-de-resgates", json=corpo).status_code == 409
    outra = autenticar(email="outra-reaplicacao@exemplo.com")
    assert c.get("/reaplicacoes-de-resgates", headers=outra).json() == []
    assert c.post("/reaplicacoes-de-resgates", json=corpo, headers=outra).status_code == 404
    assert (
        c.get(
            f"/movimentos-de-investimento/{aporte.id}/resgates-para-reaplicar", headers=outra
        ).status_code
        == 404
    )
    assert c.delete(f"/reaplicacoes-de-resgates/{id}", headers=outra).status_code == 404
    assert c.delete(f"/reaplicacoes-de-resgates/{id}").status_code == 204
    assert c.get("/metas/progresso?mes=2026-11").json()["metas"][0]["gasto"] == "150.00"
    assert c.get("/contas").json() == antes


def test_exige_sessao_e_valor_valido(cliente_autenticado):
    c = cliente_autenticado
    resgate, aporte = preparar(c)
    chave = c.post("/chaves-de-api", json={"nome": "Teste", "escopo": "escrita"}).json()
    headers = {"Authorization": f"Bearer {chave['segredo']}"}
    assert c.get("/reaplicacoes-de-resgates", headers=headers).status_code == 403
    assert (
        c.get(
            f"/movimentos-de-investimento/{aporte.id}/resgates-para-reaplicar", headers=headers
        ).status_code
        == 403
    )
    for valor in ["0.00", "100.01", 100]:
        assert (
            c.post(
                "/reaplicacoes-de-resgates",
                json={"aporte_id": str(aporte.id), "resgate_id": str(resgate.id), "valor": valor},
            ).status_code
            == 422
        )
    assert c.get("/reaplicacoes-de-resgates").json() == []


def test_cookie_exige_csrf_para_criar_e_remover(cliente_autenticado):
    c = cliente_autenticado
    resgate, aporte = preparar(c)
    token = c.headers.pop("Authorization").removeprefix("Bearer ")
    cookie = {"Cookie": f"gastoba_sessao={token}"}
    corpo = {"aporte_id": str(aporte.id), "resgate_id": str(resgate.id), "valor": "50.00"}
    assert c.post("/reaplicacoes-de-resgates", json=corpo, headers=cookie).status_code == 403
    seguro = {**cookie, "X-Gastoba-Requisicao": "1"}
    criado = c.post("/reaplicacoes-de-resgates", json=corpo, headers=seguro)
    assert criado.status_code == 201, criado.text
    caminho = f"/reaplicacoes-de-resgates/{criado.json()['id']}"
    assert c.delete(caminho, headers=cookie).status_code == 403
    assert c.get("/reaplicacoes-de-resgates", headers=cookie).status_code == 200
    assert c.delete(caminho, headers=seguro).status_code == 204
    assert c.delete(caminho, headers=seguro).status_code == 404


def test_api_keys_nao_podem_criar_nem_remover(cliente_autenticado):
    c = cliente_autenticado
    resgate, aporte = preparar(c)
    corpo = {"aporte_id": str(aporte.id), "resgate_id": str(resgate.id), "valor": "50.00"}
    criado = c.post("/reaplicacoes-de-resgates", json=corpo).json()
    for escopo in ["leitura", "escrita"]:
        chave = c.post("/chaves-de-api", json={"nome": "Teste", "escopo": escopo}).json()
        headers = {"Authorization": f"Bearer {chave['segredo']}"}
        assert c.post("/reaplicacoes-de-resgates", json=corpo, headers=headers).status_code == 403
        assert (
            c.delete(f"/reaplicacoes-de-resgates/{criado['id']}", headers=headers).status_code
            == 403
        )
    assert len(c.get("/reaplicacoes-de-resgates").json()) == 1


def test_todas_as_rotas_exigem_autenticacao(cliente):
    from uuid import uuid4

    identidade = uuid4()
    assert cliente.get("/reaplicacoes-de-resgates").status_code == 401
    assert (
        cliente.get(f"/movimentos-de-investimento/{identidade}/resgates-para-reaplicar").status_code
        == 401
    )
    assert cliente.post("/reaplicacoes-de-resgates", json={}).status_code == 401
    assert cliente.delete(f"/reaplicacoes-de-resgates/{identidade}").status_code == 401
