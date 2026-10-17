import pytest


def _criar_conta(cliente, nome="Nubank") -> str:
    resposta = cliente.post("/contas", json={"nome": nome, "saldo_inicial": "0.00"})
    assert resposta.status_code == 201
    return resposta.json()["id"]


def _ganho(cliente, conta_id, valor="5000.00", data="2026-10-05"):
    resposta = cliente.post(
        "/ganhos",
        json={"conta_id": conta_id, "valor": valor, "descricao": "Salário", "data": data},
    )
    assert resposta.status_code == 201


def _gasto(cliente, conta_id, valor, categoria, data="2026-10-10"):
    resposta = cliente.post(
        "/gastos",
        json={
            "conta_id": conta_id,
            "valor": valor,
            "descricao": "Compra",
            "data": data,
            "categoria": categoria,
        },
    )
    assert resposta.status_code == 201


def _confere_erro(resposta, status_code, codigo):
    assert resposta.status_code == status_code
    corpo = resposta.json()
    assert set(corpo) == {"erro"}
    assert corpo["erro"]["codigo"] == codigo
    assert corpo["erro"]["mensagem"]


# PUT /metas/{categoria}


def test_definir_cria_e_depois_troca_o_percentual(cliente_autenticado):
    primeira = cliente_autenticado.put("/metas/lazer", json={"percentual": 20})
    segunda = cliente_autenticado.put("/metas/lazer", json={"percentual": 35})

    assert primeira.status_code == segunda.status_code == 200
    assert primeira.json() == {"categoria": "lazer", "percentual": 20}
    assert segunda.json() == {"categoria": "lazer", "percentual": 35}
    assert cliente_autenticado.get("/metas").json() == [{"categoria": "lazer", "percentual": 35}]


@pytest.mark.parametrize("percentual", [0, -1, 101])
def test_percentual_fora_de_1_a_100_devolve_422(cliente_autenticado, percentual):
    resposta = cliente_autenticado.put("/metas/lazer", json={"percentual": percentual})

    _confere_erro(resposta, 422, "percentual_invalido")
    assert cliente_autenticado.get("/metas").json() == []


@pytest.mark.parametrize(
    "corpo", [{"percentual": "20"}, {"percentual": 20.5}, {"percentual": True}, {}]
)
def test_percentual_que_nao_e_inteiro_devolve_422_requisicao_invalida(cliente_autenticado, corpo):
    _confere_erro(cliente_autenticado.put("/metas/lazer", json=corpo), 422, "requisicao_invalida")


def test_categoria_desconhecida_devolve_422_requisicao_invalida(cliente_autenticado):
    resposta = cliente_autenticado.put("/metas/viagens", json={"percentual": 10})

    _confere_erro(resposta, 422, "requisicao_invalida")


def test_soma_acima_de_100_nao_grava_e_exatamente_100_grava(cliente_autenticado):
    cliente_autenticado.put("/metas/gasto_fixo", json={"percentual": 60})
    assert cliente_autenticado.put("/metas/lazer", json={"percentual": 40}).status_code == 200

    excedeu = cliente_autenticado.put("/metas/conforto", json={"percentual": 1})
    reduziu = cliente_autenticado.put("/metas/lazer", json={"percentual": 41})

    _confere_erro(excedeu, 422, "percentuais_excedem_100")
    _confere_erro(reduziu, 422, "percentuais_excedem_100")
    assert "101%" in excedeu.json()["erro"]["mensagem"]
    metas = {m["categoria"]: m["percentual"] for m in cliente_autenticado.get("/metas").json()}
    assert metas == {"gasto_fixo": 60, "lazer": 40}


# GET /metas


def test_listar_na_ordem_das_categorias(cliente_autenticado):
    cliente_autenticado.put("/metas/gasto_fixo", json={"percentual": 30})
    cliente_autenticado.put("/metas/investimentos", json={"percentual": 10})
    cliente_autenticado.put("/metas/lazer", json={"percentual": 20})

    lista = cliente_autenticado.get("/metas").json()

    assert [m["categoria"] for m in lista] == ["investimentos", "lazer", "gasto_fixo"]


# DELETE /metas/{categoria}


def test_remover_devolve_204_e_libera_a_soma(cliente_autenticado):
    cliente_autenticado.put("/metas/gasto_fixo", json={"percentual": 90})

    resposta = cliente_autenticado.delete("/metas/gasto_fixo")

    assert resposta.status_code == 204
    assert resposta.content == b""
    assert cliente_autenticado.get("/metas").json() == []
    assert cliente_autenticado.put("/metas/lazer", json={"percentual": 100}).status_code == 200


def test_remover_meta_inexistente_devolve_404(cliente_autenticado):
    _confere_erro(cliente_autenticado.delete("/metas/lazer"), 404, "meta_nao_encontrada")


# GET /metas/progresso


def test_progresso_traz_renda_limite_gasto_restante_e_situacao(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    _ganho(cliente_autenticado, conta_id, "5000.00")
    cliente_autenticado.put("/metas/lazer", json={"percentual": 10})  # limite 500,00
    cliente_autenticado.put("/metas/gasto_fixo", json={"percentual": 40})  # limite 2.000,00
    cliente_autenticado.put("/metas/conforto", json={"percentual": 5})  # limite 250,00
    _gasto(cliente_autenticado, conta_id, "450.00", "lazer")
    _gasto(cliente_autenticado, conta_id, "2100.00", "gasto_fixo")
    _gasto(cliente_autenticado, conta_id, "30.00", "lazer", data="2026-11-01")  # outro mês

    resposta = cliente_autenticado.get("/metas/progresso", params={"mes": "2026-10"})

    assert resposta.status_code == 200
    assert resposta.json() == {
        "mes": "2026-10",
        "renda": "5000.00",
        "metas": [
            {
                "categoria": "lazer",
                "percentual": 10,
                "limite": "500.00",
                "gasto": "450.00",
                "restante": "50.00",
                "percentual_usado": 90,
                "situacao": "alerta",
            },
            {
                "categoria": "conforto",
                "percentual": 5,
                "limite": "250.00",
                "gasto": "0.00",
                "restante": "250.00",
                "percentual_usado": 0,
                "situacao": "dentro",
            },
            {
                "categoria": "gasto_fixo",
                "percentual": 40,
                "limite": "2000.00",
                "gasto": "2100.00",
                "restante": "-100.00",
                "percentual_usado": 105,
                "situacao": "estourou",
            },
        ],
    }


def test_progresso_sem_renda_no_mes_marca_sem_renda(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    cliente_autenticado.put("/metas/lazer", json={"percentual": 20})
    _gasto(cliente_autenticado, conta_id, "10.00", "lazer")

    corpo = cliente_autenticado.get("/metas/progresso", params={"mes": "2026-10"}).json()

    assert corpo["renda"] == "0.00"
    assert corpo["metas"][0]["situacao"] == "sem_renda"
    assert corpo["metas"][0]["gasto"] == "10.00"


def test_progresso_sem_metas_devolve_so_a_renda(cliente_autenticado):
    _ganho(cliente_autenticado, _criar_conta(cliente_autenticado), "100.00")

    corpo = cliente_autenticado.get("/metas/progresso", params={"mes": "2026-10"}).json()

    assert corpo == {"mes": "2026-10", "renda": "100.00", "metas": []}


@pytest.mark.parametrize("mes", ["2026-13", "2026-00", "0000-01"])
def test_progresso_com_mes_invalido_devolve_422_mes_invalido(cliente_autenticado, mes):
    _confere_erro(
        cliente_autenticado.get("/metas/progresso", params={"mes": mes}), 422, "mes_invalido"
    )


@pytest.mark.parametrize("params", [{}, {"mes": "outubro"}, {"mes": "2026-1"}, {"mes": ""}])
def test_progresso_com_mes_ausente_ou_fora_do_padrao(cliente_autenticado, params):
    resposta = cliente_autenticado.get("/metas/progresso", params=params)

    assert resposta.status_code == 422
    assert resposta.json()["erro"]["codigo"] in {"requisicao_invalida", "mes_invalido"}


def test_chave_de_leitura_consulta_mas_nao_define(cliente_autenticado, cliente):
    segredo = cliente_autenticado.post(
        "/chaves-de-api", json={"nome": "leitor", "escopo": "leitura"}
    ).json()["segredo"]
    chave = {"Authorization": f"Bearer {segredo}"}

    assert cliente.get("/metas", headers=chave).status_code == 200
    assert (
        cliente.get("/metas/progresso", params={"mes": "2026-10"}, headers=chave).status_code == 200
    )
    _confere_erro(
        cliente.put("/metas/lazer", json={"percentual": 10}, headers=chave), 403, "acesso_negado"
    )
    _confere_erro(cliente.delete("/metas/lazer", headers=chave), 403, "acesso_negado")
