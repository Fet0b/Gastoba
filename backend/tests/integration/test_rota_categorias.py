def test_lista_as_cinco_categorias_na_ordem_do_enum(cliente_autenticado):
    resposta = cliente_autenticado.get("/categorias")

    assert resposta.status_code == 200
    assert resposta.json() == [
        {"codigo": "investimentos", "nome": "Investimentos (antiga)", "legada": True},
        {"codigo": "lazer", "nome": "Lazer", "legada": False},
        {"codigo": "conhecimento", "nome": "Conhecimento", "legada": False},
        {"codigo": "conforto", "nome": "Conforto", "legada": False},
        {"codigo": "gasto_fixo", "nome": "Gasto fixo", "legada": False},
    ]
