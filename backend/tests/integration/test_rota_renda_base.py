import pytest


def _confere_erro(resposta, status, codigo):
    assert resposta.status_code == status
    assert resposta.json()["erro"]["codigo"] == codigo


def test_consultar_definir_alterar_e_remover_sem_alterar_registros(cliente_autenticado):
    cliente = cliente_autenticado
    conta = cliente.post("/contas", json={"nome": "Conta exemplo", "saldo_inicial": "123.45"})
    assert conta.status_code == 201
    periodo = {"inicio": "2026-10-01", "fim": "2026-10-31"}
    ganho = cliente.post(
        "/ganhos",
        json={
            "conta_id": conta.json()["id"],
            "valor": "6000.00",
            "descricao": "Ganho exemplo",
            "data": "2026-10-05",
        },
    )
    assert ganho.status_code == 201
    antes = {
        rota: cliente.get(rota, params=periodo).json()
        for rota in [
            "/contas",
            "/ganhos",
            "/gastos",
            "/investimentos",
            "/movimentos-de-investimento",
        ]
    }

    assert cliente.get("/renda-base").status_code == 200
    assert cliente.get("/renda-base").json() == {"valor": None}
    for valor in ["5000.00", "7000.01"]:
        resposta = cliente.put("/renda-base", json={"valor": valor})
        assert resposta.status_code == 200
        assert resposta.json() == {"valor": valor}
        assert cliente.get("/renda-base").json() == {"valor": valor}
    for _ in range(2):
        resposta = cliente.delete("/renda-base")
        assert resposta.status_code == 204
        assert resposta.content == b""
    assert cliente.get("/renda-base").json() == {"valor": None}
    assert {rota: cliente.get(rota, params=periodo).json() for rota in antes} == antes


@pytest.mark.parametrize("valor", ["0.00", "-1.00", "1,5", "1000000000000.01", "0.001"])
def test_valor_invalido_nao_substitui_base(cliente_autenticado, valor):
    resposta = cliente_autenticado.put("/renda-base", json={"valor": valor})
    _confere_erro(resposta, 422, "valor_invalido")
    assert cliente_autenticado.get("/renda-base").json() == {"valor": None}


@pytest.mark.parametrize("corpo", [{"valor": 5000}, {"valor": True}, {"valor": None}, {}])
def test_valor_deve_ser_string_decimal(cliente_autenticado, corpo):
    _confere_erro(cliente_autenticado.put("/renda-base", json=corpo), 422, "requisicao_invalida")


def test_chaves_de_api_respeitam_escopo(cliente_autenticado, cliente):
    for escopo in ["leitura", "escrita"]:
        segredo = cliente_autenticado.post(
            "/chaves-de-api", json={"nome": "Chave exemplo", "escopo": escopo}
        ).json()["segredo"]
        chave = {"Authorization": f"Bearer {segredo}"}
        assert cliente.get("/renda-base", headers=chave).status_code == 200
        definir = cliente.put("/renda-base", json={"valor": "5000.00"}, headers=chave)
        remover = cliente.delete("/renda-base", headers=chave)
        if escopo == "leitura":
            _confere_erro(definir, 403, "acesso_negado")
            _confere_erro(remover, 403, "acesso_negado")
        else:
            assert definir.status_code == 200
            assert remover.status_code == 204
