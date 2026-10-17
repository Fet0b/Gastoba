from uuid import UUID, uuid4

import pytest

INICIO = "2026-10-01"
FIM = "2026-10-31"


def _criar_conta(cliente_autenticado, nome: str = "Nubank", saldo_inicial: str = "1000.00") -> str:
    resposta = cliente_autenticado.post(
        "/contas", json={"nome": nome, "saldo_inicial": saldo_inicial}
    )
    assert resposta.status_code == 201
    return resposta.json()["id"]


def _registrar_ganho(cliente_autenticado, conta_id, **campos):
    corpo = {
        "conta_id": str(conta_id),
        "valor": "5000.00",
        "descricao": "Salário",
        "data": "2026-10-05",
        "tags": [],
    }
    corpo.update(campos)
    return cliente_autenticado.post("/ganhos", json=corpo)


def _saldo(cliente_autenticado, conta_id: str) -> str:
    contas = cliente_autenticado.get("/contas").json()
    return next(conta["saldo"] for conta in contas if conta["id"] == conta_id)


def _listar(cliente_autenticado, **parametros):
    return cliente_autenticado.get("/ganhos", params={"inicio": INICIO, "fim": FIM, **parametros})


def _confere_formato_de_erro(resposta, codigo: str) -> None:
    corpo = resposta.json()
    assert "detail" not in corpo
    assert set(corpo) == {"erro"}
    assert corpo["erro"]["codigo"] == codigo
    assert corpo["erro"]["mensagem"]


# POST /ganhos


def test_registrar_ganho_devolve_201_e_credita_a_conta(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)

    resposta = _registrar_ganho(cliente_autenticado, conta_id, tags=["pix", "Salário", "pix"])

    assert resposta.status_code == 201
    corpo = resposta.json()
    UUID(corpo["id"])
    assert corpo == {
        "id": corpo["id"],
        "conta_id": conta_id,
        "valor": "5000.00",
        "descricao": "Salário",
        "data": "2026-10-05",
        "tags": ["pix", "salário"],
        "origem": "manual",
        "recorrencia_id": None,
    }
    assert _saldo(cliente_autenticado, conta_id) == "6000.00"


def test_dois_ganhos_somam_ao_saldo_com_centavos_exatos(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado, saldo_inicial="0.10")

    _registrar_ganho(cliente_autenticado, conta_id, valor="0.20")
    _registrar_ganho(cliente_autenticado, conta_id, valor="0.01")

    assert _saldo(cliente_autenticado, conta_id) == "0.31"


@pytest.mark.parametrize(
    "valor", ["0", "0.00", "-1.00", "10,50", "1.005", "abc", "1000000000000.01"]
)
def test_valor_invalido_devolve_422_sem_alterar_o_saldo(cliente_autenticado, valor):
    conta_id = _criar_conta(cliente_autenticado)

    resposta = _registrar_ganho(cliente_autenticado, conta_id, valor=valor)

    assert resposta.status_code == 422
    _confere_formato_de_erro(resposta, "valor_invalido")
    assert _saldo(cliente_autenticado, conta_id) == "1000.00"
    assert _listar(cliente_autenticado).json() == []


def test_valor_como_numero_json_devolve_422_requisicao_invalida(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)

    resposta = _registrar_ganho(cliente_autenticado, conta_id, valor=5000)

    assert resposta.status_code == 422
    _confere_formato_de_erro(resposta, "requisicao_invalida")


def test_descricao_vazia_e_longa_demais_devolvem_422(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)

    for descricao in ["   ", "a" * 201]:
        resposta = _registrar_ganho(cliente_autenticado, conta_id, descricao=descricao)
        assert resposta.status_code == 422
        _confere_formato_de_erro(resposta, "descricao_invalida")


def test_tag_invalida_devolve_422(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)

    resposta = _registrar_ganho(cliente_autenticado, conta_id, tags=["   "])

    assert resposta.status_code == 422
    _confere_formato_de_erro(resposta, "tag_invalida")


def test_conta_inexistente_devolve_404(cliente_autenticado):
    resposta = _registrar_ganho(cliente_autenticado, uuid4())

    assert resposta.status_code == 404
    _confere_formato_de_erro(resposta, "conta_nao_encontrada")


def test_campo_ausente_devolve_422_requisicao_invalida(cliente_autenticado):
    resposta = cliente_autenticado.post("/ganhos", json={"valor": "10.00"})

    assert resposta.status_code == 422
    _confere_formato_de_erro(resposta, "requisicao_invalida")


# GET /ganhos


def test_listar_devolve_so_o_periodo_da_data_mais_recente_para_a_mais_antiga(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    _registrar_ganho(cliente_autenticado, conta_id, descricao="Antes", data="2026-09-30")
    _registrar_ganho(cliente_autenticado, conta_id, descricao="Primeiro", data="2026-10-01")
    _registrar_ganho(cliente_autenticado, conta_id, descricao="Último", data="2026-10-31")

    resposta = _listar(cliente_autenticado)

    assert resposta.status_code == 200
    assert [g["descricao"] for g in resposta.json()] == ["Último", "Primeiro"]


def test_listar_filtra_por_conta(cliente_autenticado):
    uma = _criar_conta(cliente_autenticado, nome="Uma")
    outra = _criar_conta(cliente_autenticado, nome="Outra")
    _registrar_ganho(cliente_autenticado, uma, descricao="Da uma")
    _registrar_ganho(cliente_autenticado, outra, descricao="Da outra")

    resposta = _listar(cliente_autenticado, conta_id=uma)

    assert [g["descricao"] for g in resposta.json()] == ["Da uma"]


def test_listar_periodo_invertido_devolve_422_periodo_invalido(cliente_autenticado):
    resposta = cliente_autenticado.get("/ganhos", params={"inicio": FIM, "fim": INICIO})

    assert resposta.status_code == 422
    _confere_formato_de_erro(resposta, "periodo_invalido")


def test_listar_filtro_por_conta_inexistente_devolve_404(cliente_autenticado):
    resposta = _listar(cliente_autenticado, conta_id=uuid4())

    assert resposta.status_code == 404
    _confere_formato_de_erro(resposta, "conta_nao_encontrada")


def test_listar_sem_periodo_devolve_422_requisicao_invalida(cliente_autenticado):
    resposta = cliente_autenticado.get("/ganhos")

    assert resposta.status_code == 422
    _confere_formato_de_erro(resposta, "requisicao_invalida")


def test_ganho_nao_aparece_na_lista_de_gastos(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    _registrar_ganho(cliente_autenticado, conta_id)

    gastos = cliente_autenticado.get("/gastos", params={"inicio": INICIO, "fim": FIM})

    assert gastos.json() == []


# DELETE /ganhos/{id}


def _excluir(cliente, ganho_id):
    return cliente.delete(f"/ganhos/{ganho_id}")


def test_excluir_ganho_devolve_204_e_devolve_o_saldo(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    ganho = _registrar_ganho(cliente_autenticado, conta_id).json()
    assert _saldo(cliente_autenticado, conta_id) == "6000.00"

    resposta = _excluir(cliente_autenticado, ganho["id"])

    assert resposta.status_code == 204
    assert resposta.content == b""
    assert _saldo(cliente_autenticado, conta_id) == "1000.00"
    listados = cliente_autenticado.get(
        "/ganhos", params={"inicio": "2026-10-01", "fim": "2026-10-31"}
    ).json()
    assert listados == []


def test_excluir_ganho_inexistente_devolve_404(cliente_autenticado):
    resposta = _excluir(cliente_autenticado, "3f2b8a52-1c1e-4a55-9d3e-3a8f1b6c9d10")

    assert resposta.status_code == 404
    assert resposta.json()["erro"]["codigo"] == "ganho_nao_encontrado"


def test_excluir_duas_vezes_devolve_404_na_segunda(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    ganho = _registrar_ganho(cliente_autenticado, conta_id).json()

    _excluir(cliente_autenticado, ganho["id"])
    segunda = _excluir(cliente_autenticado, ganho["id"])

    assert segunda.status_code == 404
    assert _saldo(cliente_autenticado, conta_id) == "1000.00"


def test_excluir_ganho_de_recorrencia_devolve_409_e_nao_mexe_no_saldo(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    cliente_autenticado.post(
        "/recorrencias",
        json={
            "tipo": "ganho",
            "conta_id": conta_id,
            "valor": "100.00",
            "descricao": "Bolsa",
            "dia_do_mes": 1,
            "inicio": "2026-10-01",
            "tags": [],
        },
    )
    ganhos = cliente_autenticado.get(
        "/ganhos", params={"inicio": "2000-01-01", "fim": "2999-12-31"}
    ).json()
    assert ganhos
    saldo_antes = _saldo(cliente_autenticado, conta_id)

    resposta = _excluir(cliente_autenticado, ganhos[0]["id"])

    assert resposta.status_code == 409
    assert resposta.json()["erro"]["codigo"] == "ganho_de_recorrencia"
    assert _saldo(cliente_autenticado, conta_id) == saldo_antes


def test_excluir_ganho_com_chave_de_leitura_devolve_403(cliente, autenticar):
    ana = autenticar(email="ana@x.com", nome="Ana")
    chave = cliente.post(
        "/chaves-de-api", json={"nome": "leitura", "escopo": "leitura"}, headers=ana
    ).json()["segredo"]

    resposta = cliente.delete(
        "/ganhos/3f2b8a52-1c1e-4a55-9d3e-3a8f1b6c9d10",
        headers={"Authorization": f"Bearer {chave}"},
    )

    assert resposta.status_code == 403
    assert resposta.json()["erro"]["codigo"] == "acesso_negado"


def test_ninguem_exclui_o_ganho_de_outra_pessoa(cliente, autenticar):
    ana = autenticar(email="ana@x.com", nome="Ana")
    bia = autenticar(email="bia@x.com", nome="Bia")
    conta = cliente.post(
        "/contas", json={"nome": "Nubank", "saldo_inicial": "0.00"}, headers=ana
    ).json()["id"]
    ganho = cliente.post(
        "/ganhos",
        json={
            "conta_id": conta,
            "valor": "10.00",
            "descricao": "Salário",
            "data": "2026-10-05",
            "tags": [],
        },
        headers=ana,
    ).json()

    resposta = cliente.delete(f"/ganhos/{ganho['id']}", headers=bia)

    assert resposta.status_code == 404
    contas = cliente.get("/contas", headers=ana).json()
    assert contas[0]["saldo"] == "10.00"
