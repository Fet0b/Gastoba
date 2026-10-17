from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

INICIO = "2026-01-01"
FIM = "2026-12-31"


class RelogioFixo:
    """Hoje é 12/10/2026 em Brasília: a geração não depende do dia em que os testes rodam."""

    def agora(self) -> datetime:
        return datetime(2026, 10, 12, 15, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def relogio_fixo(cliente):
    cliente.app.state.relogio = RelogioFixo()


def _criar_conta(cliente, nome="Nubank", saldo_inicial="0.00") -> str:
    resposta = cliente.post("/contas", json={"nome": nome, "saldo_inicial": saldo_inicial})
    assert resposta.status_code == 201
    return resposta.json()["id"]


def _criar(cliente, conta_id, **campos):
    corpo = {
        "tipo": "ganho",
        "conta_id": conta_id,
        "valor": "5000.00",
        "descricao": "Salário",
        "dia_do_mes": 5,
        "inicio": "2026-08-01",
        "tags": [],
    }
    corpo.update(campos)
    return cliente.post("/recorrencias", json=corpo)


def _saldo(cliente, conta_id) -> str:
    return next(c["saldo"] for c in cliente.get("/contas").json() if c["id"] == conta_id)


def _ganhos(cliente):
    return cliente.get("/ganhos", params={"inicio": INICIO, "fim": FIM}).json()


def _gastos(cliente):
    return cliente.get("/gastos", params={"inicio": INICIO, "fim": FIM}).json()


def _confere_erro(resposta, status_code, codigo):
    assert resposta.status_code == status_code
    corpo = resposta.json()
    assert set(corpo) == {"erro"}
    assert corpo["erro"]["codigo"] == codigo
    assert corpo["erro"]["mensagem"]


# POST /recorrencias


def test_criar_ganho_recorrente_devolve_201_e_ja_gera_os_meses_vencidos(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)

    resposta = _criar(cliente_autenticado, conta_id, tags=["Salário", "pix", "salário"])

    assert resposta.status_code == 201
    corpo = resposta.json()
    UUID(corpo["id"])
    assert corpo == {
        "id": corpo["id"],
        "tipo": "ganho",
        "conta_id": conta_id,
        "valor": "5000.00",
        "descricao": "Salário",
        "dia_do_mes": 5,
        "inicio": "2026-08-01",
        "fim": None,
        "categoria": None,
        "tags": ["salário", "pix"],
        "ativa": True,
    }
    ganhos = _ganhos(cliente_autenticado)
    assert [g["data"] for g in ganhos] == ["2026-10-05", "2026-09-05", "2026-08-05"]
    assert all(g["descricao"] == "Salário" and g["tags"] == ["salário", "pix"] for g in ganhos)
    assert _saldo(cliente_autenticado, conta_id) == "15000.00"


def test_criar_gasto_recorrente_gera_gastos_com_categoria_e_debita(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado, saldo_inicial="2000.00")

    resposta = _criar(
        cliente_autenticado,
        conta_id,
        tipo="gasto",
        categoria="gasto_fixo",
        valor="1500.00",
        descricao="Aluguel",
        inicio="2026-09-01",
    )

    assert resposta.status_code == 201
    assert resposta.json()["categoria"] == "gasto_fixo"
    gastos = _gastos(cliente_autenticado)
    assert [(g["data"], g["categoria"]) for g in gastos] == [
        ("2026-10-05", "gasto_fixo"),
        ("2026-09-05", "gasto_fixo"),
    ]
    assert _saldo(cliente_autenticado, conta_id) == "-1000.00"
    assert _ganhos(cliente_autenticado) == []


def test_inicio_no_futuro_cria_sem_gerar(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)

    resposta = _criar(cliente_autenticado, conta_id, inicio="2026-12-01")

    assert resposta.status_code == 201
    assert _ganhos(cliente_autenticado) == []


@pytest.mark.parametrize(
    ("campos", "codigo"),
    [
        ({"tipo": "gasto"}, "recorrencia_invalida"),  # gasto sem categoria
        ({"categoria": "lazer"}, "recorrencia_invalida"),  # ganho com categoria
        ({"dia_do_mes": 0}, "recorrencia_invalida"),
        ({"dia_do_mes": 32}, "recorrencia_invalida"),
        ({"fim": "2026-07-31"}, "recorrencia_invalida"),
        ({"inicio": "2020-01-01"}, "recorrencia_invalida"),  # mais de 5 anos no passado
        ({"valor": "0.00"}, "valor_invalido"),
        ({"valor": "10,50"}, "valor_invalido"),
        ({"descricao": "  "}, "descricao_invalida"),
        ({"tags": ["  "]}, "tag_invalida"),
    ],
)
def test_recorrencia_invalida_devolve_422_sem_gravar(cliente_autenticado, campos, codigo):
    conta_id = _criar_conta(cliente_autenticado)

    resposta = _criar(cliente_autenticado, conta_id, **campos)

    _confere_erro(resposta, 422, codigo)
    assert cliente_autenticado.get("/recorrencias").json() == []
    assert _ganhos(cliente_autenticado) == []
    assert _saldo(cliente_autenticado, conta_id) == "0.00"


@pytest.mark.parametrize(
    "campos",
    [
        {"valor": 5000},  # número JSON no lugar da string
        {"dia_do_mes": "5"},
        {"dia_do_mes": 5.5},
        {"tipo": "outro"},
        {"categoria": "viagens"},
        {"inicio": "01/08/2026"},
    ],
)
def test_corpo_malformado_devolve_422_requisicao_invalida(cliente_autenticado, campos):
    conta_id = _criar_conta(cliente_autenticado)

    _confere_erro(_criar(cliente_autenticado, conta_id, **campos), 422, "requisicao_invalida")


def test_conta_inexistente_devolve_404(cliente_autenticado):
    _confere_erro(_criar(cliente_autenticado, str(uuid4())), 404, "conta_nao_encontrada")


def test_limite_de_50_recorrencias_ativas(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    for i in range(50):
        assert (
            _criar(
                cliente_autenticado, conta_id, descricao=f"R{i}", inicio="2026-12-01"
            ).status_code
            == 201
        )

    _confere_erro(
        _criar(cliente_autenticado, conta_id, descricao="Extra", inicio="2026-12-01"),
        422,
        "recorrencia_invalida",
    )


# GET /recorrencias


def test_listar_mostra_ativas_e_encerradas_ordenadas_por_descricao(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    _criar(cliente_autenticado, conta_id, descricao="Bolsa", inicio="2026-12-01")
    encerrada = _criar(
        cliente_autenticado, conta_id, descricao="Antiga", inicio="2026-12-01"
    ).json()
    cliente_autenticado.delete(f"/recorrencias/{encerrada['id']}")

    lista = cliente_autenticado.get("/recorrencias").json()

    assert [(r["descricao"], r["ativa"]) for r in lista] == [("Antiga", False), ("Bolsa", True)]


# PUT /recorrencias/{id}


def test_alterar_vale_daqui_para_frente_e_nao_mexe_no_que_foi_gerado(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    criada = _criar(cliente_autenticado, conta_id).json()

    resposta = cliente_autenticado.put(
        f"/recorrencias/{criada['id']}",
        json={
            "valor": "6000.00",
            "descricao": "Salário novo",
            "dia_do_mes": 10,
            "tags": ["fixo"],
            "fim": "2026-12-31",
        },
    )

    assert resposta.status_code == 200
    assert resposta.json() | {"id": None} == criada | {
        "id": None,
        "valor": "6000.00",
        "descricao": "Salário novo",
        "dia_do_mes": 10,
        "tags": ["fixo"],
        "fim": "2026-12-31",
    }
    assert {g["valor"] for g in _ganhos(cliente_autenticado)} == {"5000.00"}
    assert _saldo(cliente_autenticado, conta_id) == "15000.00"


def test_alterar_com_dados_invalidos_ou_inexistente(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    criada = _criar(cliente_autenticado, conta_id, inicio="2026-12-01").json()
    corpo = {"valor": "1.00", "descricao": "x", "dia_do_mes": 5}

    _confere_erro(
        cliente_autenticado.put(
            f"/recorrencias/{criada['id']}", json=corpo | {"categoria": "lazer"}
        ),
        422,
        "recorrencia_invalida",
    )
    _confere_erro(
        cliente_autenticado.put(f"/recorrencias/{uuid4()}", json=corpo),
        404,
        "recorrencia_nao_encontrada",
    )
    _confere_erro(
        cliente_autenticado.put("/recorrencias/nao-e-uuid", json=corpo), 422, "requisicao_invalida"
    )


# DELETE /recorrencias/{id}


def test_encerrar_devolve_204_para_de_gerar_e_mantem_o_historico(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    criada = _criar(cliente_autenticado, conta_id).json()

    resposta = cliente_autenticado.delete(f"/recorrencias/{criada['id']}")

    assert resposta.status_code == 204
    assert resposta.content == b""
    [recorrencia] = cliente_autenticado.get("/recorrencias").json()
    assert recorrencia["ativa"] is False
    assert len(_ganhos(cliente_autenticado)) == 3
    assert cliente_autenticado.delete(f"/recorrencias/{criada['id']}").status_code == 204


def test_encerrar_inexistente_devolve_404(cliente_autenticado):
    _confere_erro(
        cliente_autenticado.delete(f"/recorrencias/{uuid4()}"), 404, "recorrencia_nao_encontrada"
    )


def test_lancamentos_gerados_trazem_o_recorrencia_id_e_os_avulsos_nao(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    recorrencia = _criar(cliente_autenticado, conta_id).json()
    cliente_autenticado.post(
        "/ganhos",
        json={
            "conta_id": conta_id,
            "valor": "10.00",
            "descricao": "Avulso",
            "data": "2026-08-10",
            "tags": [],
        },
    )

    ganhos = _ganhos(cliente_autenticado)

    gerados = [g for g in ganhos if g["descricao"] == "Salário"]
    assert gerados and all(g["recorrencia_id"] == recorrencia["id"] for g in gerados)
    assert [g["recorrencia_id"] for g in ganhos if g["descricao"] == "Avulso"] == [None]


def test_gastos_gerados_trazem_o_recorrencia_id(cliente_autenticado):
    conta_id = _criar_conta(cliente_autenticado)
    recorrencia = _criar(
        cliente_autenticado, conta_id, tipo="gasto", descricao="Aluguel", categoria="gasto_fixo"
    ).json()

    gastos = _gastos(cliente_autenticado)

    assert gastos and all(g["recorrencia_id"] == recorrencia["id"] for g in gastos)
