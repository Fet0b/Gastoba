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
    assert primeira.json() == {"categoria": "lazer", "nome": "Lazer", "percentual": 20}
    assert segunda.json() == {"categoria": "lazer", "nome": "Lazer", "percentual": 35}
    assert cliente_autenticado.get("/metas").json() == [
        {"categoria": "lazer", "nome": "Lazer", "percentual": 35}
    ]


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

    assert [m["categoria"] for m in lista] == ["liberdade_financeira", "lazer", "gasto_fixo"]


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
        "renda_base": None,
        "aportes_do_mes": "0.00",
        "renda_de_referencia": "5000.00",
        "classificacoes_para_revisar": 0,
        "metas": [
            {
                "categoria": "lazer",
                "nome": "Lazer",
                "percentual": 10,
                "limite": "500.00",
                "gasto": "450.00",
                "gasto_bruto": "450.00",
                "limite_adicional": "0.00",
                "caixinhas": [],
                "guardado": "0.00",
                "percentual_guardado": 0,
                "caixinhas_guardadas": [],
                "rentabilidade": None,
                "restante": "50.00",
                "percentual_usado": 90,
                "situacao": "alerta",
            },
            {
                "categoria": "conforto",
                "nome": "Conforto",
                "percentual": 5,
                "limite": "250.00",
                "gasto": "0.00",
                "gasto_bruto": "0.00",
                "limite_adicional": "0.00",
                "caixinhas": [],
                "guardado": "0.00",
                "percentual_guardado": 0,
                "caixinhas_guardadas": [],
                "rentabilidade": None,
                "restante": "250.00",
                "percentual_usado": 0,
                "situacao": "dentro",
            },
            {
                "categoria": "gasto_fixo",
                "nome": "Gasto fixo",
                "percentual": 40,
                "limite": "2000.00",
                "gasto": "2100.00",
                "gasto_bruto": "2100.00",
                "limite_adicional": "0.00",
                "caixinhas": [],
                "guardado": "0.00",
                "percentual_guardado": 0,
                "caixinhas_guardadas": [],
                "rentabilidade": None,
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

    assert corpo == {
        "mes": "2026-10",
        "renda": "100.00",
        "renda_base": None,
        "aportes_do_mes": "0.00",
        "renda_de_referencia": "100.00",
        "classificacoes_para_revisar": 0,
        "metas": [],
    }


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


def test_progresso_usa_base_em_qualquer_mes_e_mantem_renda_real(cliente_autenticado):
    cliente = cliente_autenticado
    conta = _criar_conta(cliente)
    _ganho(cliente, conta, "7000.00")
    assert cliente.put("/metas/lazer", json={"percentual": 20}).status_code == 200
    assert cliente.put("/renda-base", json={"valor": "5000.00"}).status_code == 200
    for mes, renda in [("2026-10", "7000.00"), ("2025-01", "0.00")]:
        resposta = cliente.get("/metas/progresso", params={"mes": mes})
        assert resposta.status_code == 200
        corpo = resposta.json()
        assert corpo["renda"] == renda
        assert corpo["renda_base"] == corpo["renda_de_referencia"] == "5000.00"
        assert corpo["metas"][0]["limite"] == "1000.00"
        assert corpo["metas"][0]["situacao"] == "dentro"
    assert cliente.delete("/renda-base").status_code == 204
    corpo = cliente.get("/metas/progresso", params={"mes": "2026-10"}).json()
    assert corpo["renda_base"] is None
    assert corpo["renda_de_referencia"] == "7000.00"
    assert corpo["metas"][0]["limite"] == "1400.00"


def test_alvos_e_alias_compatibilidade(cliente_autenticado):
    alvos = cliente_autenticado.get("/metas/alvos")
    assert alvos.status_code == 200
    assert [a["codigo"] for a in alvos.json()] == [
        "liberdade_financeira",
        "lazer",
        "conhecimento",
        "conforto",
        "gasto_fixo",
    ]
    resposta = cliente_autenticado.put("/metas/investimentos", json={"percentual": 10})
    assert resposta.status_code == 200
    assert resposta.json()["categoria"] == "liberdade_financeira"
    assert resposta.json()["nome"] == "Liberdade financeira"
    assert cliente_autenticado.delete("/metas/investimentos").status_code == 204
    assert cliente_autenticado.get("/metas").json() == []


def _guardar(cliente, cabecalho=None, valor=30000, ativo=True):
    """Aporte de novembro de 2026 numa caixinha marcada em Conforto, direto no banco de teste."""
    from datetime import date
    from uuid import UUID

    from gastoba.domain.destinacao import ParteDeDestinacao
    from gastoba.domain.dinheiro import Dinheiro
    from gastoba.domain.movimento_de_investimento import (
        MovimentoDeInvestimento,
        TipoDeMovimento,
    )
    from gastoba.domain.portas import InvestimentoExterno
    from gastoba.domain.tag import Tag
    from gastoba.infrastructure.persistencia.unidade_de_trabalho import (
        UnidadeDeTrabalhoSqlAlchemy,
    )

    pessoa = UUID(cliente.get("/auth/eu", headers=cabecalho).json()["id"])
    conta = cliente.post(
        "/contas", json={"nome": "Banco fictício", "saldo_inicial": "0.00"}, headers=cabecalho
    ).json()
    uow = UnidadeDeTrabalhoSqlAlchemy(cliente.app.state.fabrica_de_sessoes)
    with uow as u:
        u.investimentos.salvar_posicao(
            pessoa, InvestimentoExterno("x", "Posição", "FIXED_INCOME", None, Dinheiro(1), "{}")
        )
        u.commit()
    with uow as u:
        [posicao] = u.investimentos.listar_posicoes(pessoa)
        movimento = MovimentoDeInvestimento(
            UUID(conta["id"]),
            TipoDeMovimento.APORTE,
            Dinheiro(valor),
            "Aporte fictício",
            date(2026, 10, 5),
            posicao.id,
        )
        u.movimentos_de_investimento.adicionar(movimento)
        u.destinacoes.adicionar(
            movimento.id, [ParteDeDestinacao(Tag("computador"), Dinheiro(valor))]
        )
        u.commit()
    marcacoes = [{"categoria": "conforto", "tag": "computador"}]
    resposta = cliente.put(
        "/guardado-nas-metas", json={"ativo": ativo, "marcacoes": marcacoes}, headers=cabecalho
    )
    assert resposta.status_code == 200, resposta.text


def test_progresso_traz_o_guardado_sem_mudar_os_numeros_existentes(cliente_autenticado):
    c = cliente_autenticado
    c.put("/renda-base", json={"valor": "4000.00"})
    c.put("/metas/conforto", json={"percentual": 25})
    conta_id = _criar_conta(c)
    _gasto(c, conta_id, "400.00", "conforto", data="2026-10-10")
    desligado = c.get("/metas/progresso", params={"mes": "2026-10"}).json()["metas"][0]
    assert desligado["guardado"] == "0.00"
    assert desligado["percentual_guardado"] == 0
    assert desligado["caixinhas_guardadas"] == []
    _guardar(c)
    ligado = c.get("/metas/progresso", params={"mes": "2026-10"}).json()["metas"][0]
    assert ligado["guardado"] == "300.00"
    assert ligado["percentual_guardado"] == 30
    assert ligado["caixinhas_guardadas"] == ["computador"]
    for campo in ("limite", "gasto", "restante", "percentual_usado", "situacao", "gasto_bruto"):
        assert ligado[campo] == desligado[campo]
    outro_mes = c.get("/metas/progresso", params={"mes": "2026-11"}).json()["metas"][0]
    assert outro_mes["guardado"] == "0.00"


def test_guardado_desligado_nao_aparece_e_outra_pessoa_nao_ve(cliente_autenticado, autenticar):
    c = cliente_autenticado
    c.put("/renda-base", json={"valor": "4000.00"})
    c.put("/metas/conforto", json={"percentual": 25})
    _guardar(c, ativo=False)
    assert (
        c.get("/metas/progresso", params={"mes": "2026-10"}).json()["metas"][0]["guardado"]
        == "0.00"
    )
    marcacoes = [{"categoria": "conforto", "tag": "computador"}]
    c.put("/guardado-nas-metas", json={"ativo": True, "marcacoes": marcacoes})
    assert (
        c.get("/metas/progresso", params={"mes": "2026-10"}).json()["metas"][0]["guardado"]
        == "300.00"
    )
    outra = autenticar(email="outra-guardado@exemplo.com", nome="Outra")
    c.put("/renda-base", json={"valor": "4000.00"}, headers=outra)
    c.put("/metas/conforto", json={"percentual": 25}, headers=outra)
    meta = c.get("/metas/progresso", params={"mes": "2026-10"}, headers=outra).json()["metas"][0]
    assert meta["guardado"] == "0.00" and meta["caixinhas_guardadas"] == []
