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


def _registrar_gasto(cliente_autenticado, conta_id, **campos):
    corpo = {
        "conta_id": str(conta_id),
        "valor": "25.90",
        "descricao": "Compras",
        "data": "2026-10-10",
        "categoria": "conforto",
        "tags": [],
    }
    corpo.update(campos)
    return cliente_autenticado.post("/gastos", json=corpo)


def _saldo(cliente_autenticado, conta_id: str) -> str:
    contas = cliente_autenticado.get("/contas").json()
    return next(conta["saldo"] for conta in contas if conta["id"] == conta_id)


def _listar(cliente_autenticado, **parametros):
    return cliente_autenticado.get("/gastos", params={"inicio": INICIO, "fim": FIM, **parametros})


def _confere_formato_de_erro(resposta, codigo: str) -> None:
    corpo = resposta.json()
    assert "detail" not in corpo
    assert set(corpo) == {"erro"}
    assert corpo["erro"]["codigo"] == codigo
    assert isinstance(corpo["erro"]["mensagem"], str)
    assert corpo["erro"]["mensagem"]


# POST /gastos


def test_registrar_gasto_devolve_201_e_debita_a_conta(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)

    resposta = _registrar_gasto(
        cliente_autenticado, conta_id, categoria="lazer", tags=["pix", "Mercado", "pix"]
    )

    assert resposta.status_code == 201
    corpo = resposta.json()
    UUID(corpo["id"])
    assert corpo["conta_id"] == conta_id
    assert corpo["valor"] == "25.90"
    assert corpo["descricao"] == "Compras"
    assert corpo["data"] == "2026-10-10"
    assert corpo["categoria"] == "lazer"
    assert corpo["tags"] == ["pix", "mercado"]
    assert corpo["origem"] == "manual"
    assert _saldo(cliente_autenticado, conta_id) == "974.10"


def test_dois_gastos_acumulam_o_debito(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)

    assert _registrar_gasto(cliente_autenticado, conta_id, valor="25.90").status_code == 201
    assert _registrar_gasto(cliente_autenticado, conta_id, valor="74.10").status_code == 201

    assert _saldo(cliente_autenticado, conta_id) == "900.00"


def test_gasto_registrado_volta_identico_na_listagem(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)

    criado = _registrar_gasto(
        cliente_autenticado, conta_id, valor="0.01", categoria="conhecimento", tags=["Livro", "pix"]
    ).json()

    assert _listar(cliente_autenticado).json() == [criado]


@pytest.mark.parametrize(
    ("saldo_inicial", "valor", "saldo_final"),
    [
        ("1000.00", "0.01", "999.99"),
        ("1000000000000.00", "1000000000000.00", "0.00"),
        ("0.00", "1000000000000.00", "-1000000000000.00"),
    ],
)
def test_debito_e_exato_ao_centavo(cliente_autenticado, saldo_inicial, valor, saldo_final):
    conta_id = _criar_conta(cliente_autenticado, saldo_inicial=saldo_inicial)

    resposta = _registrar_gasto(cliente_autenticado, conta_id, valor=valor)

    assert resposta.status_code == 201
    assert resposta.json()["valor"] == valor
    assert _saldo(cliente_autenticado, conta_id) == saldo_final


def test_debito_que_estoura_o_limite_do_saldo_devolve_422_sem_gravar(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado, saldo_inicial="-1000000000000.00")

    resposta = _registrar_gasto(cliente_autenticado, conta_id, valor="0.01")

    assert resposta.status_code == 422
    _confere_formato_de_erro(resposta, "valor_invalido")
    assert _saldo(cliente_autenticado, conta_id) == "-1000000000000.00"
    assert _listar(cliente_autenticado).json() == []


def test_conta_inexistente_devolve_404_e_saldo_intacto(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)

    resposta = _registrar_gasto(cliente_autenticado, uuid4())

    assert resposta.status_code == 404
    _confere_formato_de_erro(resposta, "conta_nao_encontrada")
    assert _saldo(cliente_autenticado, conta_id) == "1000.00"
    assert _listar(cliente_autenticado).json() == []


@pytest.mark.parametrize("valor", ["0.00", "-5.00", "25,90"])
def test_valor_invalido_devolve_422_valor_invalido(cliente_autenticado, valor):
    conta_id = _criar_conta(cliente_autenticado)

    resposta = _registrar_gasto(cliente_autenticado, conta_id, valor=valor)

    assert resposta.status_code == 422
    _confere_formato_de_erro(resposta, "valor_invalido")
    assert _saldo(cliente_autenticado, conta_id) == "1000.00"


def test_valor_como_numero_json_devolve_422_requisicao_invalida(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)

    resposta = _registrar_gasto(cliente_autenticado, conta_id, valor=25.9)

    assert resposta.status_code == 422
    _confere_formato_de_erro(resposta, "requisicao_invalida")
    assert any(d["campo"] == "body.valor" for d in resposta.json()["erro"]["detalhes"])


def test_descricao_vazia_devolve_422_descricao_invalida(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)

    resposta = _registrar_gasto(cliente_autenticado, conta_id, descricao="   ")

    assert resposta.status_code == 422
    _confere_formato_de_erro(resposta, "descricao_invalida")


def test_tag_em_branco_devolve_422_tag_invalida(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)

    resposta = _registrar_gasto(cliente_autenticado, conta_id, tags=[" "])

    assert resposta.status_code == 422
    _confere_formato_de_erro(resposta, "tag_invalida")
    assert _saldo(cliente_autenticado, conta_id) == "1000.00"


def test_categoria_ausente_devolve_422_requisicao_invalida(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    corpo = {
        "conta_id": conta_id,
        "valor": "25.90",
        "descricao": "Compras",
        "data": "2026-10-10",
    }

    resposta = cliente_autenticado.post("/gastos", json=corpo)

    assert resposta.status_code == 422
    _confere_formato_de_erro(resposta, "requisicao_invalida")
    assert any(d["campo"] == "body.categoria" for d in resposta.json()["erro"]["detalhes"])


def test_categoria_desconhecida_devolve_422_requisicao_invalida(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)

    resposta = _registrar_gasto(cliente_autenticado, conta_id, categoria="outra")

    assert resposta.status_code == 422
    _confere_formato_de_erro(resposta, "requisicao_invalida")
    assert _saldo(cliente_autenticado, conta_id) == "1000.00"


# GET /gastos


def test_listar_so_com_periodo_devolve_os_gastos_do_periodo(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    _registrar_gasto(cliente_autenticado, conta_id, descricao="Dentro", data="2026-10-10")
    _registrar_gasto(cliente_autenticado, conta_id, descricao="Fora", data="2026-11-01")

    resposta = _listar(cliente_autenticado)

    assert resposta.status_code == 200
    assert [gasto["descricao"] for gasto in resposta.json()] == ["Dentro"]


def test_listar_filtra_por_conta(cliente_autenticado):
    nubank = _criar_conta(cliente_autenticado, nome="Nubank")
    carteira = _criar_conta(cliente_autenticado, nome="Carteira")
    _registrar_gasto(cliente_autenticado, nubank, descricao="No Nubank")
    _registrar_gasto(cliente_autenticado, carteira, descricao="Na carteira")

    resposta = _listar(cliente_autenticado, conta_id=carteira)

    assert resposta.status_code == 200
    assert [gasto["descricao"] for gasto in resposta.json()] == ["Na carteira"]


def test_listar_filtra_por_tag_normalizada(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    _registrar_gasto(cliente_autenticado, conta_id, descricao="Feira", tags=["mercado"])
    _registrar_gasto(cliente_autenticado, conta_id, descricao="Cinema", tags=["pix"])

    resposta = _listar(cliente_autenticado, tag="Mercado")

    assert resposta.status_code == 200
    assert [gasto["descricao"] for gasto in resposta.json()] == ["Feira"]


def test_listar_filtra_por_categoria(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    _registrar_gasto(cliente_autenticado, conta_id, descricao="Cinema", categoria="lazer")
    _registrar_gasto(cliente_autenticado, conta_id, descricao="Aluguel", categoria="gasto_fixo")

    resposta = _listar(cliente_autenticado, categoria="lazer")

    assert resposta.status_code == 200
    assert [gasto["descricao"] for gasto in resposta.json()] == ["Cinema"]
    assert resposta.json()[0]["categoria"] == "lazer"


def test_listar_combina_categoria_e_tag(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    _registrar_gasto(
        cliente_autenticado, conta_id, descricao="Bar", categoria="lazer", tags=["pix"]
    )
    _registrar_gasto(
        cliente_autenticado, conta_id, descricao="Cinema", categoria="lazer", tags=["cartao"]
    )
    _registrar_gasto(
        cliente_autenticado, conta_id, descricao="Luz", categoria="gasto_fixo", tags=["pix"]
    )

    resposta = _listar(cliente_autenticado, categoria="lazer", tag="pix")

    assert resposta.status_code == 200
    assert [gasto["descricao"] for gasto in resposta.json()] == ["Bar"]


def test_listar_com_categoria_desconhecida_devolve_422(cliente_autenticado):
    resposta = _listar(cliente_autenticado, categoria="outra")

    assert resposta.status_code == 422
    _confere_formato_de_erro(resposta, "requisicao_invalida")


def test_limites_do_periodo_sao_inclusivos(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    _registrar_gasto(cliente_autenticado, conta_id, descricao="Primeiro dia", data=INICIO)
    _registrar_gasto(cliente_autenticado, conta_id, descricao="Último dia", data=FIM)
    _registrar_gasto(cliente_autenticado, conta_id, descricao="Antes", data="2026-09-30")

    resposta = _listar(cliente_autenticado)

    assert resposta.status_code == 200
    assert {gasto["descricao"] for gasto in resposta.json()} == {"Primeiro dia", "Último dia"}


def test_periodo_sem_gastos_devolve_lista_vazia(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    _registrar_gasto(cliente_autenticado, conta_id, data="2026-10-10")

    resposta = cliente_autenticado.get(
        "/gastos", params={"inicio": "2025-01-01", "fim": "2025-01-31"}
    )

    assert resposta.status_code == 200
    assert resposta.json() == []


def test_periodo_invertido_devolve_422_periodo_invalido(cliente_autenticado):
    resposta = cliente_autenticado.get("/gastos", params={"inicio": FIM, "fim": INICIO})

    assert resposta.status_code == 422
    _confere_formato_de_erro(resposta, "periodo_invalido")


@pytest.mark.parametrize("parametros", [{"fim": FIM}, {"inicio": INICIO}])
def test_periodo_incompleto_devolve_422_requisicao_invalida(cliente_autenticado, parametros):
    resposta = cliente_autenticado.get("/gastos", params=parametros)

    assert resposta.status_code == 422
    _confere_formato_de_erro(resposta, "requisicao_invalida")


def test_filtro_por_conta_inexistente_devolve_404(cliente_autenticado):
    resposta = _listar(cliente_autenticado, conta_id=str(uuid4()))

    assert resposta.status_code == 404
    _confere_formato_de_erro(resposta, "conta_nao_encontrada")


def test_filtro_por_tag_em_branco_devolve_422_tag_invalida(cliente_autenticado):
    resposta = cliente_autenticado.get(f"/gastos?inicio={INICIO}&fim={FIM}&tag=%20")

    assert resposta.status_code == 422
    _confere_formato_de_erro(resposta, "tag_invalida")


# OpenAPI


def test_openapi_publica_as_rotas_e_dinheiro_como_string(cliente_autenticado):
    esquema = cliente_autenticado.get("/openapi.json").json()

    for caminho in ["/contas", "/gastos", "/tags", "/categorias"]:
        assert caminho in esquema["paths"]
    componentes = esquema["components"]["schemas"]
    assert componentes["ContaResposta"]["properties"]["saldo"]["type"] == "string"
    assert componentes["GastoResposta"]["properties"]["valor"]["type"] == "string"


def test_openapi_publica_a_categoria_como_enum(cliente_autenticado):
    esquema = cliente_autenticado.get("/openapi.json").json()
    componentes = esquema["components"]["schemas"]
    categorias = ["investimentos", "lazer", "conhecimento", "conforto", "gasto_fixo"]

    referencia = componentes["RegistrarGastoRequisicao"]["properties"]["categoria"]["$ref"]
    assert componentes[referencia.rsplit("/", 1)[-1]]["enum"] == categorias
    parametros = esquema["paths"]["/gastos"]["get"]["parameters"]
    filtro = next(p for p in parametros if p["name"] == "categoria")
    assert filtro["in"] == "query"
    assert filtro["required"] is False
    referencias = [opcao["$ref"] for opcao in filtro["schema"]["anyOf"] if "$ref" in opcao]
    assert referencias == [referencia]
