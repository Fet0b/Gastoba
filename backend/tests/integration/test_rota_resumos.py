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
