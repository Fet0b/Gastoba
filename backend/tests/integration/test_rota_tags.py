def _criar_conta(cliente_autenticado) -> str:
    resposta = cliente_autenticado.post(
        "/contas", json={"nome": "Nubank", "saldo_inicial": "1000.00"}
    )
    assert resposta.status_code == 201
    return resposta.json()["id"]


def _registrar_gasto(cliente_autenticado, conta_id: str, categoria: str, tags: list[str]) -> None:
    resposta = cliente_autenticado.post(
        "/gastos",
        json={
            "conta_id": conta_id,
            "valor": "10.00",
            "descricao": "Compras",
            "data": "2026-10-10",
            "categoria": categoria,
            "tags": tags,
        },
    )
    assert resposta.status_code == 201


def test_sem_gastos_devolve_lista_vazia(cliente_autenticado):
    resposta = cliente_autenticado.get("/tags")

    assert resposta.status_code == 200
    assert resposta.json() == []


def test_tags_repetidas_aparecem_uma_vez_e_ordenadas(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    _registrar_gasto(cliente_autenticado, conta_id, "conforto", ["pix", "Mercado"])
    _registrar_gasto(cliente_autenticado, conta_id, "conforto", ["mercado", "ifood"])

    resposta = cliente_autenticado.get("/tags")

    assert resposta.status_code == 200
    assert resposta.json() == ["ifood", "mercado", "pix"]


def test_mesma_tag_em_duas_categorias_aparece_uma_vez(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    _registrar_gasto(cliente_autenticado, conta_id, "conforto", ["mercado"])
    _registrar_gasto(cliente_autenticado, conta_id, "gasto_fixo", ["mercado"])

    resposta = cliente_autenticado.get("/tags")

    assert resposta.status_code == 200
    assert resposta.json() == ["mercado"]
