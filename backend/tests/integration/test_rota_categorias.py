def test_lista_as_cinco_categorias_na_ordem_do_enum(cliente_autenticado):
    resposta = cliente_autenticado.get("/categorias")

    assert resposta.status_code == 200
    assert resposta.json() == [
        {"codigo": "investimentos", "nome": "Investimentos"},
        {"codigo": "lazer", "nome": "Lazer"},
        {"codigo": "conhecimento", "nome": "Conhecimento"},
        {"codigo": "conforto", "nome": "Conforto"},
        {"codigo": "gasto_fixo", "nome": "Gasto fixo"},
    ]
