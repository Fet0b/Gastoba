from datetime import date
from uuid import UUID

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


def test_historico_autenticado_isolado_sem_registro_de_noop(cliente, autenticar):
    assert cliente.get("/metas/historico").status_code == 401
    ana = autenticar()
    for percentual in [19, 19, 20]:
        assert (
            cliente.put("/metas/lazer", json={"percentual": percentual}, headers=ana).status_code
            == 200
        )
    assert cliente.put("/metas/conforto", json={"percentual": 100}, headers=ana).status_code == 422
    assert cliente.delete("/metas/lazer", headers=ana).status_code == 204
    registros = cliente.get("/metas/historico", headers=ana).json()
    assert [r["acao"] for r in registros] == ["removida", "alterada", "criada"]
    assert all(r["instante"].endswith("Z") for r in registros)
    bia = autenticar(email="bia-ficticia@exemplo.com")
    assert cliente.get("/metas/historico", headers=bia).json() == []


def test_aporte_sem_posicao_progresso_e_resumo(cliente_autenticado):
    c = cliente_autenticado
    conta = c.post("/contas", json={"nome": "Exemplo", "saldo_inicial": "0.00"}).json()
    c.put("/renda-base", json={"valor": "1000.00"})
    c.put("/metas/liberdade_financeira", json={"percentual": 25})
    with UnidadeDeTrabalhoSqlAlchemy(c.app.state.fabrica_de_sessoes) as u:
        u.movimentos_de_investimento.adicionar(
            MovimentoDeInvestimento(
                UUID(conta["id"]),
                TipoDeMovimento.APORTE,
                Dinheiro(30000),
                "Exemplo",
                date(2026, 11, 9),
            )
        )
        u.commit()
    meta = c.get("/metas/progresso?mes=2026-11").json()["metas"][0]
    assert (meta["gasto"], meta["percentual_usado"], meta["restante"], meta["situacao"]) == (
        "300.00",
        120,
        "-50.00",
        "estourou",
    )
    resumo = c.get("/investimentos/resumo").json()
    assert resumo["aportes_sem_destino"] == {"total": "300.00", "quantidade": 1}
    assert len(c.get("/metas/historico").json()) == 1
    assert "/vinculos-das-destinacoes" not in c.app.openapi()["paths"]
    for metodo in ["get", "put", "delete"]:
        assert getattr(c, metodo)("/vinculos-das-destinacoes").status_code == 404


def test_historico_limita_a_cem_e_serializa_escritas_concorrentes(cliente_autenticado):
    from concurrent.futures import ThreadPoolExecutor
    from datetime import UTC, datetime, timedelta

    from gastoba.application.definir_meta import DefinirMeta
    from gastoba.domain.historico_de_meta import AcaoDoHistoricoDeMeta, HistoricoDeMeta
    from gastoba.domain.meta import AlvoDaMeta

    c = cliente_autenticado
    pessoa = UUID(c.get("/auth/eu").json()["id"])
    with UnidadeDeTrabalhoSqlAlchemy(c.app.state.fabrica_de_sessoes) as u:
        for i in range(105):
            u.historico_de_metas.registrar(
                HistoricoDeMeta(
                    pessoa,
                    AlvoDaMeta.LAZER,
                    None,
                    19,
                    AcaoDoHistoricoDeMeta.CRIADA,
                    datetime(2026, 1, 1, tzinfo=UTC) + timedelta(seconds=i),
                )
            )
        u.commit()
    registros = c.get("/metas/historico").json()
    assert len(registros) == 100
    assert registros[0]["instante"] > registros[-1]["instante"]

    def salvar(percentual):
        DefinirMeta(
            UnidadeDeTrabalhoSqlAlchemy(c.app.state.fabrica_de_sessoes), c.app.state.relogio
        ).executar(pessoa, AlvoDaMeta.LAZER, percentual)

    with ThreadPoolExecutor(max_workers=2) as executor:
        list(executor.map(salvar, [20, 21]))
    with UnidadeDeTrabalhoSqlAlchemy(c.app.state.fabrica_de_sessoes) as u:
        ultimos = u.historico_de_metas.listar(pessoa)[:2]
        assert ultimos[1].percentual_anterior is None
        assert ultimos[0].percentual_anterior == ultimos[1].percentual_novo
        assert ultimos[0].percentual_novo == u.metas.obter(pessoa, AlvoDaMeta.LAZER).percentual
