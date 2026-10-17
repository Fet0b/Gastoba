"""Art. IV.5: com dois usuários, nenhum vê nem grava nos dados do outro (404, nunca 403)."""

import pytest

INICIO = "2026-10-01"
FIM = "2026-10-31"


@pytest.fixture
def ana(autenticar):
    return autenticar(email="ana@x.com", nome="Ana")


@pytest.fixture
def bia(autenticar):
    return autenticar(email="bia@x.com", nome="Bia")


def _criar_conta(cliente, quem, nome="Nubank", saldo_inicial="100.00") -> str:
    resposta = cliente.post(
        "/contas", json={"nome": nome, "saldo_inicial": saldo_inicial}, headers=quem
    )
    assert resposta.status_code == 201
    return resposta.json()["id"]


def _registrar_gasto(cliente, quem, conta_id, tags=("mercado",)):
    return cliente.post(
        "/gastos",
        json={
            "conta_id": conta_id,
            "valor": "10.00",
            "descricao": "Feira",
            "data": "2026-10-10",
            "categoria": "conforto",
            "tags": list(tags),
        },
        headers=quem,
    )


def _confere_erro(resposta, status_code: int, codigo: str) -> None:
    assert resposta.status_code == status_code
    assert resposta.json()["erro"]["codigo"] == codigo


def test_cada_um_lista_so_as_proprias_contas(cliente, ana, bia):
    _criar_conta(cliente, ana, nome="Conta da Ana")
    _criar_conta(cliente, bia, nome="Conta da Bia")

    assert [c["nome"] for c in cliente.get("/contas", headers=ana).json()] == ["Conta da Ana"]
    assert [c["nome"] for c in cliente.get("/contas", headers=bia).json()] == ["Conta da Bia"]


def test_mesmo_nome_de_conta_em_usuarios_diferentes_e_permitido(cliente, ana, bia):
    _criar_conta(cliente, ana, nome="Nubank")

    _criar_conta(cliente, bia, nome="Nubank")


def test_nao_registra_gasto_na_conta_alheia_e_o_saldo_fica_intacto(cliente, ana, bia):
    conta_da_bia = _criar_conta(cliente, bia)

    resposta = _registrar_gasto(cliente, ana, conta_da_bia)

    _confere_erro(resposta, 404, "conta_nao_encontrada")
    [conta] = cliente.get("/contas", headers=bia).json()
    assert conta["saldo"] == "100.00"
    assert cliente.get("/gastos", params={"inicio": INICIO, "fim": FIM}, headers=bia).json() == []


def test_cada_um_lista_so_os_proprios_gastos(cliente, ana, bia):
    _registrar_gasto(cliente, ana, _criar_conta(cliente, ana), tags=["da-ana"])
    _registrar_gasto(cliente, bia, _criar_conta(cliente, bia), tags=["da-bia"])

    gastos_da_ana = cliente.get(
        "/gastos", params={"inicio": INICIO, "fim": FIM}, headers=ana
    ).json()

    assert [g["tags"] for g in gastos_da_ana] == [["da-ana"]]


def test_filtrar_gastos_pela_conta_alheia_devolve_404(cliente, ana, bia):
    conta_da_bia = _criar_conta(cliente, bia)
    _registrar_gasto(cliente, bia, conta_da_bia)

    resposta = cliente.get(
        "/gastos", params={"inicio": INICIO, "fim": FIM, "conta_id": conta_da_bia}, headers=ana
    )

    _confere_erro(resposta, 404, "conta_nao_encontrada")


def test_filtrar_por_tag_nao_revela_gastos_alheios(cliente, ana, bia):
    _registrar_gasto(cliente, bia, _criar_conta(cliente, bia), tags=["segredo-da-bia"])

    resposta = cliente.get(
        "/gastos", params={"inicio": INICIO, "fim": FIM, "tag": "segredo-da-bia"}, headers=ana
    )

    assert resposta.status_code == 200
    assert resposta.json() == []


def test_cada_um_lista_so_as_proprias_tags(cliente, ana, bia):
    _registrar_gasto(cliente, ana, _criar_conta(cliente, ana), tags=["pix"])
    _registrar_gasto(cliente, bia, _criar_conta(cliente, bia), tags=["mercado"])

    assert cliente.get("/tags", headers=ana).json() == ["pix"]
    assert cliente.get("/tags", headers=bia).json() == ["mercado"]


def test_chave_de_api_age_so_em_nome_do_dono(cliente, ana, bia):
    _criar_conta(cliente, bia, nome="Conta da Bia")
    segredo = cliente.post(
        "/chaves-de-api", json={"nome": "script", "escopo": "escrita"}, headers=ana
    ).json()["segredo"]
    chave_da_ana = {"Authorization": f"Bearer {segredo}"}

    assert cliente.get("/contas", headers=chave_da_ana).json() == []
    _criar_conta(cliente, chave_da_ana, nome="Pela chave")
    assert [c["nome"] for c in cliente.get("/contas", headers=ana).json()] == ["Pela chave"]
    assert [c["nome"] for c in cliente.get("/contas", headers=bia).json()] == ["Conta da Bia"]


def test_cada_um_lista_so_as_proprias_chaves(cliente, ana, bia):
    cliente.post("/chaves-de-api", json={"nome": "da-ana", "escopo": "leitura"}, headers=ana)
    cliente.post("/chaves-de-api", json={"nome": "da-bia", "escopo": "leitura"}, headers=bia)

    assert [c["nome"] for c in cliente.get("/chaves-de-api", headers=ana).json()] == ["da-ana"]
    assert [c["nome"] for c in cliente.get("/chaves-de-api", headers=bia).json()] == ["da-bia"]


def test_nao_revoga_chave_alheia(cliente, ana, bia):
    criada = cliente.post(
        "/chaves-de-api", json={"nome": "da-bia", "escopo": "leitura"}, headers=bia
    ).json()

    resposta = cliente.delete(f"/chaves-de-api/{criada['id']}", headers=ana)

    _confere_erro(resposta, 404, "chave_de_api_nao_encontrada")
    chave_da_bia = {"Authorization": f"Bearer {criada['segredo']}"}
    assert cliente.get("/contas", headers=chave_da_bia).status_code == 200


def test_recurso_alheio_e_indistinguivel_de_inexistente(cliente, ana, bia):
    # Mesmo status e mesmo corpo: a resposta não revela que o id existe para outra pessoa.
    conta_da_bia = _criar_conta(cliente, bia)
    chave_da_bia = cliente.post(
        "/chaves-de-api", json={"nome": "da-bia", "escopo": "leitura"}, headers=bia
    ).json()["id"]
    inexistente = "00000000-0000-0000-0000-00000000dead"

    assert _registrar_gasto(cliente, ana, conta_da_bia).json() == (
        _registrar_gasto(cliente, ana, inexistente).json()
    )
    alheia = cliente.delete(f"/chaves-de-api/{chave_da_bia}", headers=ana)
    sumida = cliente.delete(f"/chaves-de-api/{inexistente}", headers=ana)
    assert (alheia.status_code, alheia.json()) == (sumida.status_code, sumida.json())


def test_eu_devolve_cada_usuario(cliente, ana, bia):
    assert cliente.get("/auth/eu", headers=ana).json()["email"] == "ana@x.com"
    assert cliente.get("/auth/eu", headers=bia).json()["email"] == "bia@x.com"


def _registrar_ganho(cliente, quem, conta_id, descricao="Salário"):
    return cliente.post(
        "/ganhos",
        json={
            "conta_id": conta_id,
            "valor": "10.00",
            "descricao": descricao,
            "data": "2026-10-10",
            "tags": [],
        },
        headers=quem,
    )


def test_nao_registra_ganho_na_conta_alheia_e_o_saldo_fica_intacto(cliente, ana, bia):
    conta_da_bia = _criar_conta(cliente, bia)

    resposta = _registrar_ganho(cliente, ana, conta_da_bia)

    _confere_erro(resposta, 404, "conta_nao_encontrada")
    [conta] = cliente.get("/contas", headers=bia).json()
    assert conta["saldo"] == "100.00"
    assert cliente.get("/ganhos", params={"inicio": INICIO, "fim": FIM}, headers=bia).json() == []


def test_cada_um_lista_so_os_proprios_ganhos(cliente, ana, bia):
    _registrar_ganho(cliente, ana, _criar_conta(cliente, ana), descricao="da-ana")
    _registrar_ganho(cliente, bia, _criar_conta(cliente, bia), descricao="da-bia")

    ganhos_da_ana = cliente.get(
        "/ganhos", params={"inicio": INICIO, "fim": FIM}, headers=ana
    ).json()

    assert [g["descricao"] for g in ganhos_da_ana] == ["da-ana"]


def test_filtrar_ganhos_pela_conta_alheia_devolve_404(cliente, ana, bia):
    conta_da_bia = _criar_conta(cliente, bia)
    _registrar_ganho(cliente, bia, conta_da_bia)

    resposta = cliente.get(
        "/ganhos", params={"inicio": INICIO, "fim": FIM, "conta_id": conta_da_bia}, headers=ana
    )

    _confere_erro(resposta, 404, "conta_nao_encontrada")


def test_chave_de_leitura_lista_ganhos_mas_nao_registra(cliente, ana):
    conta = _criar_conta(cliente, ana)
    segredo = cliente.post(
        "/chaves-de-api", json={"nome": "leitor", "escopo": "leitura"}, headers=ana
    ).json()["segredo"]
    chave = {"Authorization": f"Bearer {segredo}"}

    assert (
        cliente.get("/ganhos", params={"inicio": INICIO, "fim": FIM}, headers=chave).status_code
        == 200
    )
    _confere_erro(_registrar_ganho(cliente, chave, conta), 403, "acesso_negado")


def _criar_recorrencia(cliente, quem, conta_id, descricao="Salário"):
    return cliente.post(
        "/recorrencias",
        json={
            "tipo": "ganho",
            "conta_id": conta_id,
            "valor": "10.00",
            "descricao": descricao,
            "dia_do_mes": 5,
            "inicio": "2999-01-01",
        },
        headers=quem,
    )


def test_nao_cria_recorrencia_na_conta_alheia(cliente, ana, bia):
    conta_da_bia = _criar_conta(cliente, bia)

    _confere_erro(_criar_recorrencia(cliente, ana, conta_da_bia), 404, "conta_nao_encontrada")

    assert cliente.get("/recorrencias", headers=bia).json() == []


def test_cada_um_lista_so_as_proprias_recorrencias(cliente, ana, bia):
    _criar_recorrencia(cliente, ana, _criar_conta(cliente, ana), descricao="da-ana")
    _criar_recorrencia(cliente, bia, _criar_conta(cliente, bia), descricao="da-bia")

    assert [r["descricao"] for r in cliente.get("/recorrencias", headers=ana).json()] == ["da-ana"]


def test_alterar_ou_encerrar_recorrencia_alheia_devolve_404_e_nao_muda_nada(cliente, ana, bia):
    da_bia = _criar_recorrencia(cliente, bia, _criar_conta(cliente, bia)).json()
    corpo = {"valor": "1.00", "descricao": "invadida", "dia_do_mes": 1}

    _confere_erro(
        cliente.put(f"/recorrencias/{da_bia['id']}", json=corpo, headers=ana),
        404,
        "recorrencia_nao_encontrada",
    )
    _confere_erro(
        cliente.delete(f"/recorrencias/{da_bia['id']}", headers=ana),
        404,
        "recorrencia_nao_encontrada",
    )
    [intacta] = cliente.get("/recorrencias", headers=bia).json()
    assert intacta["descricao"] == "Salário" and intacta["ativa"] is True


def test_cada_um_tem_as_proprias_metas_e_a_soma_e_por_pessoa(cliente, ana, bia):
    cliente.put("/metas/lazer", json={"percentual": 100}, headers=ana)

    assert cliente.put("/metas/lazer", json={"percentual": 10}, headers=bia).status_code == 200
    assert cliente.get("/metas", headers=ana).json() == [{"categoria": "lazer", "percentual": 100}]
    assert cliente.get("/metas", headers=bia).json() == [{"categoria": "lazer", "percentual": 10}]
    _confere_erro(cliente.delete("/metas/gasto_fixo", headers=bia), 404, "meta_nao_encontrada")


def test_o_progresso_nao_mistura_renda_nem_gastos_de_outra_pessoa(cliente, ana, bia):
    conta_da_bia = _criar_conta(cliente, bia)
    _registrar_ganho(cliente, bia, conta_da_bia)
    _registrar_gasto(cliente, bia, conta_da_bia)
    cliente.put("/metas/conforto", json={"percentual": 50}, headers=ana)

    corpo = cliente.get("/metas/progresso", params={"mes": "2026-10"}, headers=ana).json()

    assert corpo["renda"] == "0.00"
    assert [m["gasto"] for m in corpo["metas"]] == ["0.00"]
