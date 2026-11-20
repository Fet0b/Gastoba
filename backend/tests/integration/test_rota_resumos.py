import pytest

PERIODO = {"inicio": "2026-10-01", "fim": "2026-10-31"}


def _criar_conta(cliente, nome="Nubank", **extra) -> str:
    resposta = cliente.post("/contas", json={"nome": nome, "saldo_inicial": "1000.00"}, **extra)
    assert resposta.status_code == 201
    return resposta.json()["id"]


def _registrar(cliente, conta_id, valor, tags, categoria="conforto", data="2026-10-10", **extra):
    resposta = cliente.post(
        "/gastos",
        json={
            "conta_id": conta_id,
            "valor": valor,
            "descricao": "Compra",
            "data": data,
            "categoria": categoria,
            "tags": tags,
        },
        **extra,
    )
    assert resposta.status_code == 201


def _resumo(cliente, **parametros):
    return cliente.get("/resumos/tags", params={**PERIODO, **parametros})


def test_sem_gastos_devolve_total_zero_e_nenhuma_fatia(cliente_autenticado):
    resposta = _resumo(cliente_autenticado)

    assert resposta.status_code == 200
    assert resposta.json() == {**PERIODO, "total": "0.00", "fatias": []}


def test_divide_o_valor_entre_as_tags_com_o_resto_na_primeira(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    _registrar(cliente_autenticado, conta_id, "10.00", ["mercado", "pix", "casa"])
    _registrar(cliente_autenticado, conta_id, "5.00", [])

    resposta = _resumo(cliente_autenticado)

    assert resposta.status_code == 200
    assert resposta.json() == {
        **PERIODO,
        "total": "15.00",
        "fatias": [
            {"tag": None, "valor": "5.00"},
            {"tag": "mercado", "valor": "3.34"},
            {"tag": "casa", "valor": "3.33"},
            {"tag": "pix", "valor": "3.33"},
        ],
    }


def test_o_total_e_a_soma_dos_gastos_do_mesmo_periodo(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    _registrar(cliente_autenticado, conta_id, "10.01", ["a", "b"])
    _registrar(cliente_autenticado, conta_id, "0.01", ["a", "b"])
    _registrar(cliente_autenticado, conta_id, "7.77", [])
    gastos = cliente_autenticado.get("/gastos", params=PERIODO).json()

    resumo = _resumo(cliente_autenticado).json()

    centavos = lambda texto: int(texto.replace(".", ""))  # noqa: E731
    assert centavos(resumo["total"]) == sum(centavos(g["valor"]) for g in gastos)
    assert sum(centavos(f["valor"]) for f in resumo["fatias"]) == centavos(resumo["total"])


def test_filtra_por_conta_e_por_categoria(cliente_autenticado):
    nubank = _criar_conta(cliente_autenticado, "Nubank")
    carteira = _criar_conta(cliente_autenticado, "Carteira")
    _registrar(cliente_autenticado, nubank, "10.00", ["a"])
    _registrar(cliente_autenticado, carteira, "20.00", ["b"], categoria="lazer")

    por_conta = _resumo(cliente_autenticado, conta_id=carteira).json()
    por_categoria = _resumo(cliente_autenticado, categoria="lazer").json()

    assert por_conta["fatias"] == [{"tag": "b", "valor": "20.00"}]
    assert por_categoria["fatias"] == [{"tag": "b", "valor": "20.00"}]


def test_so_conta_o_periodo_pedido(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    _registrar(cliente_autenticado, conta_id, "10.00", ["a"], data="2026-09-30")

    assert _resumo(cliente_autenticado).json()["total"] == "0.00"


def test_conta_inexistente_devolve_404(cliente_autenticado):
    resposta = _resumo(cliente_autenticado, conta_id="3f2b8a52-1c1e-4a55-9d3e-3a8f1b6c9d10")

    assert resposta.status_code == 404
    assert resposta.json()["erro"]["codigo"] == "conta_nao_encontrada"


def test_periodo_invertido_devolve_422(cliente_autenticado):
    resposta = cliente_autenticado.get(
        "/resumos/tags", params={"inicio": "2026-11-01", "fim": "2026-10-01"}
    )

    assert resposta.status_code == 422
    assert resposta.json()["erro"]["codigo"] == "periodo_invalido"


def test_categoria_desconhecida_e_periodo_ausente_devolvem_422(cliente_autenticado):
    assert _resumo(cliente_autenticado, categoria="viagem").status_code == 422
    assert cliente_autenticado.get("/resumos/tags").status_code == 422


def test_cada_usuario_ve_so_o_proprio_resumo(cliente, autenticar):
    ana = autenticar(email="ana@x.com", nome="Ana")
    bia = autenticar(email="bia@x.com", nome="Bia")
    conta_ana = _criar_conta(cliente, headers=ana)
    _registrar(cliente, conta_ana, "10.00", ["mercado"], headers=ana)

    resumo_da_ana = cliente.get("/resumos/tags", params=PERIODO, headers=ana).json()
    resumo_da_bia = cliente.get("/resumos/tags", params=PERIODO, headers=bia).json()
    conta_alheia = cliente.get(
        "/resumos/tags", params={**PERIODO, "conta_id": conta_ana}, headers=bia
    )

    assert resumo_da_ana["total"] == "10.00"
    assert resumo_da_bia == {**PERIODO, "total": "0.00", "fatias": []}
    assert conta_alheia.status_code == 404


@pytest.fixture
def reserva_ficticia(cliente_autenticado):
    from datetime import date
    from uuid import UUID

    from gastoba.domain.categoria import CategoriaDoGasto
    from gastoba.domain.destinacao import ParteDeDestinacao
    from gastoba.domain.dinheiro import Dinheiro
    from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
    from gastoba.domain.portas import InvestimentoExterno
    from gastoba.domain.tag import Tag
    from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy

    c = cliente_autenticado
    dono = UUID(c.get("/auth/eu").json()["id"])
    conta = c.post("/contas", json={"nome": "Carteira fictícia", "saldo_inicial": "900.00"}).json()
    gasto = c.post(
        "/gastos",
        json={
            "conta_id": conta["id"],
            "descricao": "Compra fictícia",
            "valor": "80.01",
            "data": "2026-10-10",
            "categoria": "conforto",
            "tags": ["loja", "online"],
        },
    ).json()
    with UnidadeDeTrabalhoSqlAlchemy(c.app.state.fabrica_de_sessoes) as u:
        u.investimentos.salvar_posicao(
            dono,
            InvestimentoExterno(
                "posicao-ficticia", "Reserva fictícia", "FIXED_INCOME", None, Dinheiro(10500), "{}"
            ),
        )
        investimento = u.investimentos.listar_posicoes(dono)[0]
        m = MovimentoDeInvestimento(
            UUID(conta["id"]),
            TipoDeMovimento.APORTE,
            Dinheiro(10000),
            "Aporte fictício",
            date(2026, 10, 10),
            investimento_id=investimento.id,
            categoria=CategoriaDoGasto.CONFORTO,
        )
        u.movimentos_de_investimento.adicionar(m)
        u.destinacoes.adicionar(m.id, [ParteDeDestinacao(Tag("celular"), Dinheiro(10000))])
        u.commit()
    return c, gasto


def test_resumo_de_tags_liquido_preserva_contrato_filtros_e_isolamento(
    reserva_ficticia, autenticar
):
    c, g = reserva_ficticia
    r = c.post(f"/gastos/{g['id']}/coberturas", json={"tag": "celular", "valor": "30.00"})
    assert r.status_code == 201
    periodo = {"inicio": "2026-10-01", "fim": "2026-10-31"}
    for filtros in [{}, {"conta_id": g["conta_id"]}, {"categoria": "conforto"}]:
        resumo = c.get("/resumos/tags", params={**periodo, **filtros})
        assert resumo.status_code == 200
        assert resumo.json()["total"] == "50.01"
        assert resumo.json()["fatias"] == [
            {"tag": "loja", "valor": "25.01"},
            {"tag": "online", "valor": "25.00"},
        ]
    assert (
        c.get("/resumos/tags", params={**periodo, "categoria": "lazer"}).json()["total"] == "0.00"
    )
    assert (
        c.get("/resumos/tags", params={"inicio": "2026-11-01", "fim": "2026-11-30"}).json()["total"]
        == "0.00"
    )
    bruto = c.get("/gastos", params=periodo).json()[0]
    assert (bruto["valor"], bruto["valor_coberto"]) == ("80.01", "30.00")
    outro = autenticar(email="outra-ficticia@exemplo.com")
    assert c.get("/resumos/tags", params=periodo, headers=outro).json()["total"] == "0.00"


def test_cobrir_e_desfazer_altera_metricas_sem_reescrever_financas(reserva_ficticia):
    from sqlalchemy import text

    c, g = reserva_ficticia
    periodo = {"inicio": "2026-10-01", "fim": "2026-10-31"}

    def snapshot():
        with c.app.state.fabrica_de_sessoes() as s:
            return {
                t: s.execute(text(f"SELECT * FROM {t} ORDER BY id")).all()
                for t in [
                    "gastos",
                    "contas",
                    "movimentos_de_investimento",
                    "destinacoes",
                    "investimentos",
                ]
            }

    antes = snapshot()
    cobertura = c.post(f"/gastos/{g['id']}/coberturas", json={"tag": "celular", "valor": "30.00"})
    assert cobertura.status_code == 201
    assert c.get("/resumos/tags", params=periodo).json()["total"] == "50.01"
    assert snapshot() == antes
    assert c.delete(f"/gastos/{g['id']}/coberturas/{cobertura.json()['id']}").status_code == 204
    assert c.get("/resumos/tags", params=periodo).json()["total"] == "80.01"
    assert (
        c.post(
            f"/gastos/{g['id']}/coberturas", json={"tag": "celular", "valor": "80.01"}
        ).status_code
        == 201
    )
    assert c.get("/resumos/tags", params=periodo).json()["fatias"] == []
    assert c.get("/tags").json() == ["loja", "online"]
    assert snapshot() == antes


@pytest.mark.parametrize("escopo", ["leitura", "escrita"])
def test_revisao_e_cobertura_rejeitam_chaves_mesmo_em_leitura(reserva_ficticia, escopo):
    c, g = reserva_ficticia
    chave = c.post("/chaves-de-api", json={"nome": "Exemplo fictício", "escopo": escopo}).json()[
        "segredo"
    ]
    cabecalho = {"Authorization": f"Bearer {chave}"}
    for metodo, url, corpo in [
        ("get", "/reservas-das-destinacoes?categoria=conforto", None),
        ("get", "/revisao-de-investimentos", None),
        ("post", f"/gastos/{g['id']}/coberturas", {"tag": "celular", "valor": "1.00"}),
        ("post", f"/revisao-de-investimentos/gastos/{g['id']}", {"categoria": "lazer"}),
    ]:
        kwargs = {"headers": cabecalho}
        if corpo is not None:
            kwargs["json"] = corpo
        r = getattr(c, metodo)(url, **kwargs)
        assert r.status_code == 403
        assert r.json()["erro"]["codigo"] == "acesso_negado"


@pytest.mark.parametrize("escopo", ["leitura", "escrita"])
@pytest.mark.parametrize(
    "metodo,caminho,corpo",
    [
        ("GET", "/revisao-de-investimentos", None),
        ("GET", "/reservas-das-destinacoes?categoria=conforto", None),
        (
            "POST",
            "/revisao-de-investimentos/aportes/00000000-0000-0000-0000-000000000001",
            {"categoria": None},
        ),
        (
            "POST",
            "/revisao-de-investimentos/recorrencias/00000000-0000-0000-0000-000000000001",
            {"categoria": "conforto"},
        ),
        (
            "DELETE",
            "/gastos/00000000-0000-0000-0000-000000000001/coberturas/00000000-0000-0000-0000-000000000002",
            None,
        ),
    ],
)
def test_todas_as_operacoes_dedicadas_exigem_sessao(
    cliente_autenticado, escopo, metodo, caminho, corpo
):
    c = cliente_autenticado
    segredo = c.post("/chaves-de-api", json={"nome": "Chave fictícia", "escopo": escopo}).json()[
        "segredo"
    ]
    kwargs = {"headers": {"Authorization": f"Bearer {segredo}"}}
    if corpo is not None:
        kwargs["json"] = corpo
    r = c.request(metodo, caminho, **kwargs)
    assert r.status_code == 403
    assert r.json()["erro"]["codigo"] == "acesso_negado"


def test_cores_com_barra_paleta_isolamento_e_chave_de_escrita(reserva_ficticia, autenticar):
    c, _ = reserva_ficticia
    for escopo, esperado in [("leitura", 403), ("escrita", 200)]:
        segredo = c.post(
            "/chaves-de-api", json={"nome": "Chave fictícia", "escopo": escopo}
        ).json()["segredo"]
        r = c.put(
            "/cores-das-destinacoes",
            headers={"Authorization": f"Bearer {segredo}"},
            json={"tag": "casa/escritorio", "cor": "menta"},
        )
        assert r.status_code == esperado
    assert c.put("/cores-das-destinacoes", json={"tag": "celular", "cor": "menta"}).json() == {
        "tag": "celular",
        "cor": "menta",
    }
    assert c.get("/reservas-das-destinacoes?categoria=conforto").json()[0]["cor"] == "menta"
    assert c.get("/investimentos").json()[0]["destinacoes"][0]["cor"] == "menta"
    assert (
        c.put("/cores-das-destinacoes", json={"tag": "celular", "cor": "inexistente"}).status_code
        == 422
    )
    outro = autenticar(email="outra-cor-ficticia@exemplo.com")
    assert c.delete("/cores-das-destinacoes?tag=celular", headers=outro).status_code == 204
    assert c.get("/reservas-das-destinacoes?categoria=conforto").json()[0]["cor"] == "menta"
