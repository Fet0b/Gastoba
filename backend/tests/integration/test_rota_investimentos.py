"""Investimentos: aporte com destinações, realocação, resumo, histórico e aceite em lote."""

from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from gastoba.api.app import criar_app
from gastoba.domain.alocacao_de_caixinha import AlocacaoDeCaixinha
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.portas import ContaExterna, InvestimentoExterno, TransacaoExterna
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import SentidoDaTransacao
from gastoba.infrastructure.persistencia.banco import criar_engine
from gastoba.infrastructure.persistencia.modelos import (
    Base,
    CadastroDeDestinacaoModelo,
    HistoricoDeInvestimentoModelo,
)
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy
from gastoba.infrastructure.relogio_do_sistema import RelogioDoSistema
from gastoba.infrastructure.seguranca.hasher_de_senha_scrypt import HasherDeSenhaScrypt

DONO = "dono@x.com"
HOJE = date(2026, 11, 9)


@pytest.fixture(autouse=True)
def relogio_dos_investimentos(monkeypatch):
    # Já é dia 10 em UTC, mas ainda dia 9 em Brasília, como na falha do CI.
    instante = datetime(2026, 11, 10, 1, tzinfo=UTC)
    monkeypatch.setattr(RelogioDoSistema, "agora", lambda self: instante)


class ProvedorFalso:
    def listar_contas(self, id_do_item):
        return [ContaExterna("c1", "Conta Corrente", Dinheiro(150000))]

    def listar_operacoes_do_investimento(self, id_do_investimento):
        return []

    def listar_investimentos(self, id_do_item):
        return [
            InvestimentoExterno(
                "lci",
                "LCI BTG",
                "FIXED_INCOME",
                "LCI",
                Dinheiro(41001),
                '{"rate": 101.2, "rateType": "CDI", "fixedAnnualRate": 0}',
                valor_aplicado=Dinheiro(40000),
                rendimento=Dinheiro(1001),
            )
        ]

    def listar_transacoes(self, id_da_conta, desde):
        saida = SentidoDaTransacao.SAIDA
        return [
            TransacaoExterna("t1", Dinheiro(30000), "Aplicação 1", HOJE, saida, None),
            TransacaoExterna("t2", Dinheiro(10000), "Aplicação 2", HOJE, saida, None),
            TransacaoExterna("t3", Dinheiro(2590), "Mercado", HOJE, saida, "PIX"),
            TransacaoExterna("t4", Dinheiro(1000), "Cinema", HOJE, saida, None),
            # A emissão da própria LCI: mesmo nome e o valor aplicado da posição.
            TransacaoExterna(
                "t6", Dinheiro(40000), "EMISSAO - LCI BTG - Venc: 01/10/2028", HOJE, saida, None
            ),
            TransacaoExterna(
                "t5", Dinheiro(500000), "Salário", HOJE, SentidoDaTransacao.ENTRADA, None
            ),
        ]


@pytest.fixture
def cliente_dos_investimentos(configuracoes_teste):
    configuracoes = configuracoes_teste.model_copy(
        update={
            "pluggy_client_id": "id",
            "pluggy_client_secret": SecretStr("segredo"),
            "pluggy_item_ids": ["item-1"],
            "pluggy_email_do_dono": DONO,
            "pluggy_intervalo_horas": 0,
        }
    )
    engine = criar_engine(configuracoes.url_banco)
    Base.metadata.create_all(engine)
    engine.dispose()
    app = criar_app(configuracoes)
    app.state.hasher_de_senha = HasherDeSenhaScrypt(n=2, r=1, p=1)
    app.state.provedor_open_finance = ProvedorFalso()
    with TestClient(app, base_url="http://localhost") as cliente:
        yield cliente


@pytest.fixture
def dono(cliente_dos_investimentos, autenticar_em):
    quem = autenticar_em(cliente_dos_investimentos, email=DONO, nome="Dono")
    assert cliente_dos_investimentos.post("/sincronizacoes", headers=quem).status_code == 200
    return quem


@pytest.fixture
def outra_pessoa(cliente_dos_investimentos, autenticar_em):
    return autenticar_em(cliente_dos_investimentos, email="outra@x.com", nome="Outra")


def _caixa(cliente, quem):
    return {t["descricao"]: t for t in cliente.get("/transacoes-importadas", headers=quem).json()}


def _investimento(cliente, quem):
    return cliente.get("/investimentos", headers=quem).json()[0]


def _aceitar(cliente, quem, descricao, **corpo):
    transacao = _caixa(cliente, quem)[descricao]
    return cliente.post(
        f"/transacoes-importadas/{transacao['id']}/aceitar", json=corpo, headers=quem
    )


def _aportar(cliente, quem, descricao, **percentuais):
    investimento = _investimento(cliente, quem)
    return _aceitar(
        cliente,
        quem,
        descricao,
        como_investimento=True,
        investimento_id=investimento["id"],
        destinacoes=[{"tag": t, "percentual": p} for t, p in percentuais.items()],
    )


def test_lista_o_investimento_sem_destinacao_e_com_historico_do_dia(
    cliente_dos_investimentos, dono
):
    investimento = _investimento(cliente_dos_investimentos, dono)

    assert (investimento["nome"], investimento["saldo"], investimento["tipo"]) == (
        "LCI BTG",
        "410.01",
        "FIXED_INCOME",
    )
    assert investimento["atualizado_em"] == HOJE.isoformat()
    assert investimento["destinacoes"] == [
        {
            "tag": None,
            "cor": None,
            # A instituição informa R$ 400,00 aplicados: tudo está sem destinação (078).
            "principal": "400.00",
            "valor_atual": "410.01",
            "rendimento": "10.01",
            "rentabilidade": "2.50",
        }
    ]
    historico = cliente_dos_investimentos.get(
        "/investimentos/historico",
        params={"inicio": HOJE.isoformat(), "fim": HOJE.isoformat()},
        headers=dono,
    ).json()
    assert [(p["investimento_id"], p["saldo"]) for p in historico] == [
        (investimento["id"], "410.01")
    ]


def test_a_caixa_sugere_o_investimento_da_emissao_ate_haver_aporte_nele(
    cliente_dos_investimentos, dono
):
    investimento = _investimento(cliente_dos_investimentos, dono)
    caixa = _caixa(cliente_dos_investimentos, dono)

    emissao = "EMISSAO - LCI BTG - Venc: 01/10/2028"
    assert caixa[emissao]["investimento_sugerido_id"] == investimento["id"]
    assert caixa["Mercado"]["investimento_sugerido_id"] is None
    assert caixa["Salário"]["investimento_sugerido_id"] is None

    assert _aportar(cliente_dos_investimentos, dono, "Aplicação 1", casa=100).status_code == 201
    caixa = _caixa(cliente_dos_investimentos, dono)
    assert caixa[emissao]["investimento_sugerido_id"] is None


def test_aporte_com_destinacoes_ratea_o_saldo_e_aparece_nos_movimentos(
    cliente_dos_investimentos, dono
):
    assert _aportar(cliente_dos_investimentos, dono, "Aplicação 1", casa=100).status_code == 201
    resposta = _aportar(cliente_dos_investimentos, dono, "Aplicação 2", viagem=100)
    assert resposta.json()["tipo"] == "aporte"

    destinacoes = _investimento(cliente_dos_investimentos, dono)["destinacoes"]
    assert [(d["tag"], d["principal"], d["valor_atual"]) for d in destinacoes] == [
        ("casa", "300.00", "307.51"),
        ("viagem", "100.00", "102.50"),
    ]
    periodo = {"inicio": HOJE.isoformat(), "fim": HOJE.isoformat()}
    movimentos = cliente_dos_investimentos.get(
        "/movimentos-de-investimento", params=periodo, headers=dono
    ).json()
    assert sorted((m["descricao"], m["valor"], m["tipo"]) for m in movimentos) == [
        ("Aplicação 1", "300.00", "aporte"),
        ("Aplicação 2", "100.00", "aporte"),
    ]
    assert cliente_dos_investimentos.get("/gastos", params=periodo, headers=dono).json() == []


def test_resumo_por_destinacao_e_por_tipo(cliente_dos_investimentos, dono):
    _aportar(cliente_dos_investimentos, dono, "Aplicação 1", casa=60, viagem=40)

    por_destino = cliente_dos_investimentos.get("/investimentos/resumo", headers=dono).json()
    por_tipo = cliente_dos_investimentos.get(
        "/investimentos/resumo", params={"visao": "tipo"}, headers=dono
    ).json()

    assert por_destino["total"] == "410.01"
    assert [(f["rotulo"], f["valor"]) for f in por_destino["fatias"]] == [
        ("casa", "184.51"),
        ("viagem", "123.00"),
        (None, "102.50"),  # os R$ 100,00 aplicados sem caixinha
    ]
    assert por_tipo["fatias"] == [{"rotulo": "FIXED_INCOME", "valor": "410.01", "cor": None}]
    erro = cliente_dos_investimentos.get(
        "/investimentos/resumo", params={"visao": "xis"}, headers=dono
    )
    assert erro.status_code == 422


def test_realocar_move_principal_e_lista_o_historico_da_realocacao(cliente_dos_investimentos, dono):
    _aportar(cliente_dos_investimentos, dono, "Aplicação 1", casa=100)
    investimento = _investimento(cliente_dos_investimentos, dono)

    resposta = cliente_dos_investimentos.post(
        f"/investimentos/{investimento['id']}/realocacoes",
        json={"origem": "Casa", "destino": "viagem", "percentual": 50, "data": HOJE.isoformat()},
        headers=dono,
    )

    assert resposta.status_code == 201
    assert (resposta.json()["origem"], resposta.json()["valor"]) == ("casa", "150.00")
    destinacoes = _investimento(cliente_dos_investimentos, dono)["destinacoes"]
    assert [(d["tag"], d["principal"]) for d in destinacoes if d["tag"] is not None] == [
        ("casa", "150.00"),
        ("viagem", "150.00"),
    ]
    lista = cliente_dos_investimentos.get(
        f"/investimentos/{investimento['id']}/realocacoes", headers=dono
    ).json()
    assert [(r["origem"], r["destino"], r["valor"]) for r in lista] == [
        ("casa", "viagem", "150.00")
    ]


def test_erros_de_destinacao_e_realocacao(cliente_dos_investimentos, dono):
    soma_errada = _aportar(cliente_dos_investimentos, dono, "Aplicação 1", casa=50)
    assert (soma_errada.status_code, soma_errada.json()["erro"]["codigo"]) == (
        422,
        "destinacao_invalida",
    )
    _aportar(cliente_dos_investimentos, dono, "Aplicação 1", casa=100)
    investimento = _investimento(cliente_dos_investimentos, dono)

    acima = cliente_dos_investimentos.post(
        f"/investimentos/{investimento['id']}/realocacoes",
        json={"origem": "casa", "destino": "viagem", "valor": "300.01", "data": HOJE.isoformat()},
        headers=dono,
    )
    assert (acima.status_code, acima.json()["erro"]["codigo"]) == (422, "principal_insuficiente")


def test_aporte_em_investimento_inexistente_da_404(cliente_dos_investimentos, dono):
    resposta = _aceitar(
        cliente_dos_investimentos,
        dono,
        "Aplicação 1",
        como_investimento=True,
        investimento_id="00000000-0000-0000-0000-000000000001",
        destinacoes=[{"tag": "casa", "percentual": 100}],
    )

    assert (resposta.status_code, resposta.json()["erro"]["codigo"]) == (
        404,
        "investimento_nao_encontrado",
    )


def test_associar_movimento_sem_investimento_e_so_uma_vez(cliente_dos_investimentos, dono):
    movimento = _aceitar(
        cliente_dos_investimentos, dono, "Aplicação 1", como_investimento=True
    ).json()
    investimento = _investimento(cliente_dos_investimentos, dono)
    corpo = {
        "investimento_id": investimento["id"],
        "destinacoes": [{"tag": "casa", "percentual": 100}],
    }

    primeira = cliente_dos_investimentos.post(
        f"/movimentos-de-investimento/{movimento['id']}/destinacoes", json=corpo, headers=dono
    )
    segunda = cliente_dos_investimentos.post(
        f"/movimentos-de-investimento/{movimento['id']}/destinacoes", json=corpo, headers=dono
    )

    assert primeira.status_code == 200
    assert primeira.json()["investimento_id"] == investimento["id"]
    assert (segunda.status_code, segunda.json()["erro"]["codigo"]) == (
        409,
        "movimento_ja_associado",
    )
    assert _investimento(cliente_dos_investimentos, dono)["destinacoes"][0]["principal"] == "300.00"


def test_aceitar_em_lote_categoriza_varias_de_uma_vez(cliente_dos_investimentos, dono):
    caixa = _caixa(cliente_dos_investimentos, dono)
    ids = [caixa[d]["id"] for d in ("Mercado", "Cinema")]

    resposta = cliente_dos_investimentos.post(
        "/transacoes-importadas/aceitar-em-lote",
        json={"transacao_ids": ids, "categoria": "lazer", "tags": ["Pix"]},
        headers=dono,
    )

    assert resposta.status_code == 201
    assert [a["tipo"] for a in resposta.json()["aceitas"]] == ["gasto", "gasto"]
    gastos = cliente_dos_investimentos.get(
        "/gastos", params={"inicio": HOJE.isoformat(), "fim": HOJE.isoformat()}, headers=dono
    ).json()
    assert sorted((g["descricao"], g["categoria"], g["tags"]) for g in gastos) == [
        ("Cinema", "lazer", ["pix"]),
        ("Mercado", "lazer", ["pix"]),
    ]
    assert "Mercado" not in _caixa(cliente_dos_investimentos, dono)


def test_lote_com_entrada_ou_vazio_falha_sem_aceitar_nada(cliente_dos_investimentos, dono):
    caixa = _caixa(cliente_dos_investimentos, dono)

    com_entrada = cliente_dos_investimentos.post(
        "/transacoes-importadas/aceitar-em-lote",
        json={
            "transacao_ids": [caixa["Mercado"]["id"], caixa["Salário"]["id"]],
            "categoria": "lazer",
        },
        headers=dono,
    )
    vazio = cliente_dos_investimentos.post(
        "/transacoes-importadas/aceitar-em-lote",
        json={"transacao_ids": [], "categoria": "lazer"},
        headers=dono,
    )

    assert com_entrada.status_code == vazio.status_code == 422
    assert com_entrada.json()["erro"]["codigo"] == "transacao_importada_invalida"
    assert len(_caixa(cliente_dos_investimentos, dono)) == 6


def test_lote_como_aporte_e_gasto_com_categoria_investimentos_e_recusado(
    cliente_dos_investimentos, dono
):
    caixa = _caixa(cliente_dos_investimentos, dono)
    investimento = _investimento(cliente_dos_investimentos, dono)

    aportes = cliente_dos_investimentos.post(
        "/transacoes-importadas/aceitar-em-lote",
        json={
            "transacao_ids": [caixa["Aplicação 1"]["id"], caixa["Aplicação 2"]["id"]],
            "como_investimento": True,
            "investimento_id": investimento["id"],
            "destinacoes": [{"tag": "casa", "percentual": 100}],
        },
        headers=dono,
    )
    como_gasto = cliente_dos_investimentos.post(
        "/transacoes-importadas/aceitar-em-lote",
        json={"transacao_ids": [caixa["Mercado"]["id"]], "categoria": "investimentos"},
        headers=dono,
    )

    assert [a["tipo"] for a in aportes.json()["aceitas"]] == ["aporte", "aporte"]
    assert _investimento(cliente_dos_investimentos, dono)["destinacoes"][0]["principal"] == "400.00"
    assert como_gasto.status_code == 422
    assert como_gasto.json()["erro"]["codigo"] == "categoria_invalida"


def test_outra_pessoa_nao_ve_nem_mexe_nos_investimentos_do_dono(
    cliente_dos_investimentos, dono, outra_pessoa
):
    _aportar(cliente_dos_investimentos, dono, "Aplicação 1", casa=100)
    investimento = _investimento(cliente_dos_investimentos, dono)
    periodo = {"inicio": HOJE.isoformat(), "fim": HOJE.isoformat()}
    c = cliente_dos_investimentos

    assert c.get("/investimentos", headers=outra_pessoa).json() == []
    assert c.get("/investimentos/resumo", headers=outra_pessoa).json()["fatias"] == []
    assert c.get("/investimentos/historico", params=periodo, headers=outra_pessoa).json() == []
    assert c.get("/movimentos-de-investimento", params=periodo, headers=outra_pessoa).json() == []
    realocar = c.post(
        f"/investimentos/{investimento['id']}/realocacoes",
        json={"origem": "casa", "destino": "x", "percentual": 10, "data": HOJE.isoformat()},
        headers=outra_pessoa,
    )
    listar = c.get(f"/investimentos/{investimento['id']}/realocacoes", headers=outra_pessoa)
    assert realocar.status_code == listar.status_code == 404
    assert realocar.json()["erro"]["codigo"] == "investimento_nao_encontrado"


def test_traz_a_rentabilidade_do_investimento_e_de_cada_destinacao(cliente_dos_investimentos, dono):
    _aportar(cliente_dos_investimentos, dono, "Aplicação 1", casa=100)
    _aportar(cliente_dos_investimentos, dono, "Aplicação 2", viagem=100)

    investimento = _investimento(cliente_dos_investimentos, dono)

    assert (
        investimento["valor_aplicado"],
        investimento["rendimento"],
        investimento["rentabilidade"],
    ) == ("400.00", "10.01", "2.50")
    por_tag = {
        d["tag"]: (d["principal"], d["valor_atual"], d["rendimento"], d["rentabilidade"])
        for d in investimento["destinacoes"]
    }
    assert por_tag == {
        "casa": ("300.00", "307.51", "7.51", "2.50"),
        "viagem": ("100.00", "102.50", "2.50", "2.50"),
    }


def _dividir(cliente, quem, descricao, partes):
    transacao = _caixa(cliente, quem)[descricao]
    return cliente.post(
        f"/transacoes-importadas/{transacao['id']}/dividir", json={"partes": partes}, headers=quem
    )


def test_dividir_uma_saida_cria_um_gasto_por_parte(cliente_dos_investimentos, dono):
    resposta = _dividir(
        cliente_dos_investimentos,
        dono,
        "Mercado",
        [
            {"categoria": "conforto", "tags": ["Pix"], "percentual": 70},
            {"categoria": "lazer", "percentual": 30},
        ],
    )

    assert resposta.status_code == 201
    assert [c["tipo"] for c in resposta.json()["criados"]] == ["gasto", "gasto"]
    periodo = {"inicio": HOJE.isoformat(), "fim": HOJE.isoformat()}
    gastos = cliente_dos_investimentos.get("/gastos", params=periodo, headers=dono).json()
    assert sorted((g["descricao"], g["valor"], g["categoria"], g["tags"]) for g in gastos) == [
        ("Mercado (1/2)", "18.13", "conforto", ["pix"]),
        ("Mercado (2/2)", "7.77", "lazer", []),
    ]
    assert "Mercado" not in _caixa(cliente_dos_investimentos, dono)
    assert cliente_dos_investimentos.get("/contas", headers=dono).json()[0]["saldo"] == "1500.00"


def test_dividir_com_uma_parte_de_aporte_cria_aporte_e_gasto(cliente_dos_investimentos, dono):
    c = cliente_dos_investimentos
    _aportar(c, dono, "Aplicação 1", casa=100)
    investimento = _investimento(c, dono)

    resposta = _dividir(
        c,
        dono,
        "Aplicação 2",
        [
            {
                "como_investimento": True,
                "percentual": 50,
                "investimento_id": investimento["id"],
                "destinacoes": [{"tag": "viagem", "percentual": 100}],
            },
            {"categoria": "lazer", "percentual": 50},
        ],
    )

    assert resposta.status_code == 201
    assert [i["tipo"] for i in resposta.json()["criados"]] == ["aporte", "gasto"]
    tags = {d["tag"] for d in _investimento(c, dono)["destinacoes"]}
    assert {"casa", "viagem"} <= tags


def test_dividir_uma_entrada_cria_ganhos_sem_categoria(cliente_dos_investimentos, dono):
    resposta = _dividir(
        cliente_dos_investimentos, dono, "Salário", [{"percentual": 50}, {"percentual": 50}]
    )

    assert [c["tipo"] for c in resposta.json()["criados"]] == ["ganho", "ganho"]


def test_divisao_invalida_da_422_e_a_transacao_continua_pendente(cliente_dos_investimentos, dono):
    c = cliente_dos_investimentos
    uma = _dividir(c, dono, "Mercado", [{"categoria": "lazer", "percentual": 100}])
    soma = _dividir(
        c,
        dono,
        "Mercado",
        [{"categoria": "lazer", "percentual": 50}, {"categoria": "lazer", "percentual": 40}],
    )
    sem_categoria = _dividir(c, dono, "Mercado", [{"percentual": 50}, {"percentual": 50}])
    investimentos = _dividir(
        c,
        dono,
        "Mercado",
        [
            {"categoria": "investimentos", "tags": ["casa"], "percentual": 50},
            {"categoria": "lazer", "percentual": 50},
        ],
    )

    assert [r.json()["erro"]["codigo"] for r in (uma, soma, sem_categoria, investimentos)] == [
        "divisao_invalida",
        "divisao_invalida",
        "transacao_importada_invalida",
        "categoria_invalida",
    ]
    assert "Mercado" in _caixa(c, dono)


def test_outra_pessoa_nao_divide_transacao_do_dono(cliente_dos_investimentos, dono, outra_pessoa):
    transacao = _caixa(cliente_dos_investimentos, dono)["Mercado"]

    resposta = cliente_dos_investimentos.post(
        f"/transacoes-importadas/{transacao['id']}/dividir",
        json={"partes": [{"categoria": "lazer", "percentual": 50}] * 2},
        headers=outra_pessoa,
    )

    assert resposta.status_code == 404
    assert "Mercado" in _caixa(cliente_dos_investimentos, dono)


def _definir_destinacoes(cliente, quem, investimento_id, **percentuais):
    return cliente.post(
        f"/investimentos/{investimento_id}/destinacoes",
        json={"destinacoes": [{"tag": t, "percentual": p} for t, p in percentuais.items()]},
        headers=quem,
    )


def test_definir_destinacoes_distribui_o_aplicado_ainda_sem_principal(
    cliente_dos_investimentos, dono
):
    c = cliente_dos_investimentos
    _aportar(c, dono, "Aplicação 1", casa=100)
    investimento = _investimento(c, dono)

    resposta = _definir_destinacoes(c, dono, investimento["id"], reserva=50, viagem=50)

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert (corpo["conta_id"], corpo["investimento_id"], corpo["origem"]) == (
        None,
        investimento["id"],
        "saldo_inicial",
    )
    assert (corpo["tipo"], corpo["descricao"], corpo["valor"]) == (
        "aporte",
        "Saldo inicial",
        "100.00",
    )
    assert corpo["destinacoes"] == [
        {"tag": "reserva", "valor": "50.00", "categoria": None, "coberto": None},
        {"tag": "viagem", "valor": "50.00", "categoria": None, "coberto": None},
    ]
    destinacoes = _investimento(c, dono)["destinacoes"]
    assert [(d["tag"], d["principal"]) for d in destinacoes] == [
        ("casa", "300.00"),
        ("reserva", "50.00"),
        ("viagem", "50.00"),
    ]
    # Aplicação e saldo inicial são movimentos internos, sem fluxo externo confirmado.
    dia = date.fromisoformat(corpo["data"])
    periodo = {"inicio": dia.isoformat(), "fim": dia.isoformat()}
    movimentos = c.get("/movimentos-de-investimento", params=periodo, headers=dono).json()
    assert sorted((m["descricao"], m["origem"], m["conta_id"] is None) for m in movimentos) == [
        ("Aplicação 1", "open_finance", False),
        ("Saldo inicial", "saldo_inicial", True),
    ]
    assert c.put("/metas/investimentos", json={"percentual": 10}, headers=dono).status_code == 200
    progresso = c.get("/metas/progresso", params={"mes": dia.strftime("%Y-%m")}, headers=dono)
    [meta] = progresso.json()["metas"]
    assert meta["gasto"] == "300.00"
    assert c.get("/gastos", params=periodo, headers=dono).json() == []

    de_novo = _definir_destinacoes(c, dono, investimento["id"], casa=100)
    assert (de_novo.status_code, de_novo.json()["erro"]["codigo"]) == (
        409,
        "sem_valor_a_destinar",
    )


def test_definir_destinacoes_com_erro(cliente_dos_investimentos, dono, outra_pessoa):
    c = cliente_dos_investimentos
    investimento = _investimento(c, dono)

    soma = _definir_destinacoes(c, dono, investimento["id"], casa=50)
    alheio = _definir_destinacoes(c, outra_pessoa, investimento["id"], casa=100)
    inexistente = _definir_destinacoes(c, dono, "00000000-0000-0000-0000-000000000001", casa=100)
    sem_corpo = c.post(f"/investimentos/{investimento['id']}/destinacoes", json={}, headers=dono)

    assert (soma.status_code, soma.json()["erro"]["codigo"]) == (422, "destinacao_invalida")
    for resposta in (alheio, inexistente):
        assert (resposta.status_code, resposta.json()["erro"]["codigo"]) == (
            404,
            "investimento_nao_encontrado",
        )
    assert sem_corpo.status_code == 422
    assert _investimento(c, dono)["destinacoes"][0]["tag"] is None


def test_a_taxa_da_instituicao_vem_sem_o_adicional_zero(cliente_dos_investimentos, dono):
    investimento = _investimento(cliente_dos_investimentos, dono)

    assert investimento["taxa"] == {
        "percentual": "101.2",
        "indexador": "CDI",
        "adicional_anual": None,
    }


def _principais(cliente, quem):
    return {
        d["tag"]: d["principal"]
        for d in _investimento(cliente, quem)["destinacoes"]
        if d["tag"] is not None
    }


def _realocar(cliente, quem, investimento, origem, destino, percentual):
    return cliente.post(
        f"/investimentos/{investimento['id']}/realocacoes",
        json={
            "origem": origem,
            "destino": destino,
            "percentual": percentual,
            "data": HOJE.isoformat(),
        },
        headers=quem,
    )


def test_desfazer_uma_realocacao_devolve_o_principal_a_origem(cliente_dos_investimentos, dono):
    c = cliente_dos_investimentos
    _aportar(c, dono, "Aplicação 1", casa=100)
    investimento = _investimento(c, dono)
    realocacao = _realocar(c, dono, investimento, "casa", "viagem", 50).json()

    resposta = c.delete(
        f"/investimentos/{investimento['id']}/realocacoes/{realocacao['id']}", headers=dono
    )

    assert resposta.status_code == 204
    assert _principais(c, dono) == {"casa": "300.00"}
    assert c.get(f"/investimentos/{investimento['id']}/realocacoes", headers=dono).json() == []


def test_nao_desfaz_realocacao_cujo_destino_ja_foi_realocado(cliente_dos_investimentos, dono):
    c = cliente_dos_investimentos
    _aportar(c, dono, "Aplicação 1", casa=100)
    investimento = _investimento(c, dono)
    primeira = _realocar(c, dono, investimento, "casa", "viagem", 100).json()
    _realocar(c, dono, investimento, "viagem", "celular", 100)

    resposta = c.delete(
        f"/investimentos/{investimento['id']}/realocacoes/{primeira['id']}", headers=dono
    )

    assert (resposta.status_code, resposta.json()["erro"]["codigo"]) == (
        422,
        "principal_insuficiente",
    )
    assert _principais(c, dono) == {"celular": "300.00"}


def test_desfazer_realocacao_inexistente_ou_de_outra_pessoa(
    cliente_dos_investimentos, dono, outra_pessoa
):
    c = cliente_dos_investimentos
    _aportar(c, dono, "Aplicação 1", casa=100)
    investimento = _investimento(c, dono)
    realocacao = _realocar(c, dono, investimento, "casa", "viagem", 50).json()

    inexistente = c.delete(
        f"/investimentos/{investimento['id']}/realocacoes/{uuid4()}", headers=dono
    )
    alheia = c.delete(
        f"/investimentos/{investimento['id']}/realocacoes/{realocacao['id']}", headers=outra_pessoa
    )

    assert (inexistente.status_code, inexistente.json()["erro"]["codigo"]) == (
        404,
        "realocacao_nao_encontrada",
    )
    assert (alheia.status_code, alheia.json()["erro"]["codigo"]) == (
        404,
        "investimento_nao_encontrado",
    )
    assert _principais(c, dono) == {"casa": "150.00", "viagem": "150.00"}


def test_desfazer_o_saldo_inicial_libera_o_valor_para_definir_de_novo(
    cliente_dos_investimentos, dono
):
    c = cliente_dos_investimentos
    investimento = _investimento(c, dono)
    corpo = {"destinacoes": [{"tag": "computador", "percentual": 100}]}
    movimento = c.post(
        f"/investimentos/{investimento['id']}/destinacoes", json=corpo, headers=dono
    ).json()

    resposta = c.delete(f"/movimentos-de-investimento/{movimento['id']}", headers=dono)

    assert resposta.status_code == 204
    assert _principais(c, dono) == {}
    de_novo = c.post(
        f"/investimentos/{investimento['id']}/destinacoes",
        json={"destinacoes": [{"tag": "celular", "percentual": 100}]},
        headers=dono,
    )
    assert de_novo.status_code == 201
    assert _principais(c, dono) == {"celular": "400.00"}


def test_so_o_saldo_inicial_se_desfaz_e_so_pelo_dono(cliente_dos_investimentos, dono, outra_pessoa):
    c = cliente_dos_investimentos
    aporte = _aportar(c, dono, "Aplicação 1", casa=100).json()
    investimento = _investimento(c, dono)
    saldo_inicial = c.post(
        f"/investimentos/{investimento['id']}/destinacoes",
        json={"destinacoes": [{"tag": "viagem", "percentual": 100}]},
        headers=dono,
    )

    de_aporte = c.delete(f"/movimentos-de-investimento/{aporte['id']}", headers=dono)
    alheio = c.delete(f"/movimentos-de-investimento/{uuid4()}", headers=outra_pessoa)

    assert (de_aporte.status_code, de_aporte.json()["erro"]["codigo"]) == (
        409,
        "movimento_nao_desfazivel",
    )
    assert alheio.status_code == 404
    assert saldo_inicial.status_code == 201


def _movimentos(cliente, quem):
    return cliente.get(
        "/movimentos-de-investimento",
        params={"inicio": HOJE.isoformat(), "fim": HOJE.isoformat()},
        headers=quem,
    ).json()


def _estado_financeiro(cliente, quem):
    periodo = {"inicio": HOJE.isoformat(), "fim": HOJE.isoformat()}
    estado = {
        rota: cliente.get(rota, params=periodo, headers=quem).json()
        for rota in [
            "/contas",
            "/gastos",
            "/ganhos",
            "/investimentos",
            "/movimentos-de-investimento",
        ]
    }
    estado["aceitas"] = cliente.get("/transacoes-importadas?estado=aceita", headers=quem).json()
    return estado


def _desfazer_classificacao(cliente, quem, movimento_id, **opcoes):
    return cliente.post(
        f"/movimentos-de-investimento/{movimento_id}/desfazer-classificacao", headers=quem, **opcoes
    )


@pytest.mark.parametrize(
    ("descricao", "novo_aceite"),
    [
        ("Aplicação 1", {"categoria": "lazer"}),
        ("Aplicação 1", {"como_investimento": True}),
        ("Salário", {}),
    ],
)
def test_desfazer_classificacao_reabre_a_mesma_transacao_e_permite_novo_aceite(
    cliente_dos_investimentos, dono, descricao, novo_aceite
):
    c = cliente_dos_investimentos
    transacao = _caixa(c, dono)[descricao]
    # Outro gasto importado fica fora do grupo e precisa permanecer intacto.
    assert _aceitar(c, dono, "Mercado", categoria="conforto").status_code == 201
    assert c.put("/metas/investimentos", json={"percentual": 20}, headers=dono).status_code == 200
    resposta = _aceitar(c, dono, descricao, como_investimento=True)
    assert resposta.status_code == 201
    movimento_id = resposta.json()["id"]
    movimento = next(m for m in _movimentos(c, dono) if m["id"] == movimento_id)
    assert movimento.get("transacao_importada_id") == transacao["id"]
    antes = _estado_financeiro(c, dono)
    resposta = _desfazer_classificacao(c, dono, movimento_id)
    assert resposta.status_code == 200
    assert resposta.json() == {
        "transacao_id": transacao["id"],
        "estado": "pendente",
        "lancamentos_removidos": 1,
    }
    assert all(m["id"] != movimento_id for m in _movimentos(c, dono))
    reaberta = _caixa(c, dono)[descricao]
    for campo in ["id", "conta_id", "descricao", "data", "valor", "sentido", "tipo_de_operacao"]:
        assert reaberta[campo] == transacao[campo]
    depois = _estado_financeiro(c, dono)
    assert depois["/contas"] == antes["/contas"]
    assert depois["/gastos"] == antes["/gastos"]
    assert depois["/ganhos"] == antes["/ganhos"]
    progresso = c.get(
        "/metas/progresso", params={"mes": HOJE.strftime("%Y-%m")}, headers=dono
    ).json()
    assert progresso["metas"][0]["gasto"] == "0.00"
    assert _desfazer_classificacao(c, dono, movimento_id).status_code == 404
    assert _aceitar(c, dono, descricao, **novo_aceite).status_code == 201


def _divisao_com_aporte(cliente, quem):
    investimento = _investimento(cliente, quem)
    transacao = _caixa(cliente, quem)["Aplicação 1"]
    resposta = _dividir(
        cliente,
        quem,
        "Aplicação 1",
        [
            {"categoria": "lazer", "percentual": 40},
            {
                "como_investimento": True,
                "percentual": 60,
                "investimento_id": investimento["id"],
                "destinacoes": [{"tag": "reserva", "percentual": 100}],
            },
        ],
    )
    assert resposta.status_code == 201
    movimento_id = next(p["id"] for p in resposta.json()["criados"] if p["tipo"] == "aporte")
    return transacao, movimento_id


def test_desfazer_divisao_exige_confirmacao_e_remove_todas_as_partes(
    cliente_dos_investimentos, dono
):
    c = cliente_dos_investimentos
    transacao, movimento_id = _divisao_com_aporte(c, dono)
    for categoria in ["lazer", "investimentos"]:
        assert (
            c.put(f"/metas/{categoria}", json={"percentual": 20}, headers=dono).status_code == 200
        )
    antes = _estado_financeiro(c, dono)
    resposta = _desfazer_classificacao(c, dono, movimento_id)
    assert resposta.status_code == 409
    assert resposta.json()["erro"]["codigo"] == "divisao_exige_confirmacao"
    assert "2 partes" in resposta.json()["erro"]["mensagem"]
    assert _estado_financeiro(c, dono) == antes
    resposta = _desfazer_classificacao(
        c, dono, movimento_id, json={"desfazer_divisao_inteira": True}
    )
    assert resposta.status_code == 200
    assert resposta.json() == {
        "transacao_id": transacao["id"],
        "estado": "pendente",
        "lancamentos_removidos": 2,
    }
    depois = _estado_financeiro(c, dono)
    assert depois["/gastos"] == [] and depois["/movimentos-de-investimento"] == []
    assert depois["/contas"] == antes["/contas"]
    assert "Aplicação 1" in _caixa(c, dono)
    assert [(d["tag"], d["principal"]) for d in _investimento(c, dono)["destinacoes"]] == [
        (None, "400.00")
    ]
    progresso = c.get(
        "/metas/progresso", params={"mes": HOJE.strftime("%Y-%m")}, headers=dono
    ).json()
    assert {m["gasto"] for m in progresso["metas"]} == {"0.00"}


@pytest.mark.parametrize("escopo", ["leitura", "escrita"])
def test_chave_de_api_nao_desfaz_nem_altera_movimentos_destinacoes_gastos_ou_estado(
    cliente_dos_investimentos, dono, escopo, monkeypatch
):
    from gastoba.application.desfazer_classificacao_de_investimento import (
        DesfazerClassificacaoDeInvestimento,
    )

    def proibido(*args, **kwargs):
        raise AssertionError("API key não deve executar nem ler o grupo financeiro")

    monkeypatch.setattr(DesfazerClassificacaoDeInvestimento, "executar", proibido)
    c = cliente_dos_investimentos
    _, movimento_id = _divisao_com_aporte(c, dono)
    segredo = c.post(
        "/chaves-de-api", json={"nome": "Chave exemplo", "escopo": escopo}, headers=dono
    ).json()["segredo"]
    antes = _estado_financeiro(c, dono)
    resposta = _desfazer_classificacao(
        c,
        {"Authorization": f"Bearer {segredo}"},
        movimento_id,
        json={"desfazer_divisao_inteira": True},
    )
    assert resposta.status_code == 403
    assert resposta.json()["erro"]["codigo"] == "acesso_negado"
    assert _estado_financeiro(c, dono) == antes


def test_desfazer_classificacao_com_cookie_exige_origem_e_aceita_sessao(
    cliente_dos_investimentos, dono
):
    c = cliente_dos_investimentos
    movimento_id = _aceitar(c, dono, "Aplicação 1", como_investimento=True).json()["id"]
    cookie = {"Cookie": "gastoba_sessao=" + dono["Authorization"].removeprefix("Bearer ")}
    antes = _estado_financeiro(c, dono)
    resposta = _desfazer_classificacao(c, cookie, movimento_id)
    assert resposta.status_code == 403
    assert resposta.json()["erro"]["codigo"] == "requisicao_invalida_origem"
    assert _estado_financeiro(c, dono) == antes
    assert (
        _desfazer_classificacao(c, cookie | {"X-Gastoba-Requisicao": "1"}, movimento_id).status_code
        == 200
    )


def test_sem_caixa_para_a_pessoa_ou_importacao_desligada_nao_altera_nada(
    cliente_dos_investimentos, dono, outra_pessoa
):
    c = cliente_dos_investimentos
    movimento_id = _aceitar(c, dono, "Aplicação 1", como_investimento=True).json()["id"]
    antes = _estado_financeiro(c, dono)
    resposta = _desfazer_classificacao(c, outra_pessoa, movimento_id)
    assert resposta.status_code == 409
    assert resposta.json()["erro"]["codigo"] == "movimento_nao_desfazivel"
    assert _estado_financeiro(c, dono) == antes
    configuracoes = c.app.state.configuracoes
    c.app.state.configuracoes = configuracoes.model_copy(update={"pluggy_item_ids": []})
    resposta = _desfazer_classificacao(c, dono, movimento_id)
    assert resposta.status_code == 409
    assert resposta.json()["erro"]["codigo"] == "movimento_nao_desfazivel"
    c.app.state.configuracoes = configuracoes
    assert _estado_financeiro(c, dono) == antes


def test_dona_nao_desfaz_movimento_alheio_e_inexistente(
    cliente_dos_investimentos, dono, outra_pessoa
):
    from uuid import UUID

    from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
    from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy

    c = cliente_dos_investimentos
    conta = c.post("/contas", json={"nome": "Outra conta"}, headers=outra_pessoa).json()
    movimento = MovimentoDeInvestimento(
        UUID(conta["id"]), TipoDeMovimento.APORTE, Dinheiro(100), "Exemplo", HOJE
    )
    with UnidadeDeTrabalhoSqlAlchemy(c.app.state.fabrica_de_sessoes) as uow:
        uow.movimentos_de_investimento.adicionar(movimento)
        uow.commit()
    for id_ in [movimento.id, uuid4()]:
        resposta = _desfazer_classificacao(c, dono, id_)
        assert resposta.status_code == 404
        assert resposta.json()["erro"]["codigo"] == "movimento_de_investimento_nao_encontrado"
    assert _movimentos(c, outra_pessoa)[0]["id"] == str(movimento.id)


@pytest.mark.parametrize(
    "regra",
    [
        "manual",
        "saldo_inicial",
        "pendente",
        "ignorada",
        "conta_manual",
        "soma",
        "sem_origem",
        "divisao_antiga",
    ],
)
def test_rota_desfazer_bloqueia_com_409_sem_escrever(cliente_dos_investimentos, dono, regra):
    from uuid import UUID

    from gastoba.infrastructure.persistencia.modelos import (
        ContaModelo,
        MovimentoDeInvestimentoModelo,
        TransacaoImportadaModelo,
    )

    c = cliente_dos_investimentos
    investimento = _investimento(c, dono)
    if regra == "saldo_inicial":
        movimento_id = _definir_destinacoes(c, dono, investimento["id"], reserva=100).json()["id"]
    else:
        movimento_id = _aceitar(c, dono, "Aplicação 1", como_investimento=True).json()["id"]
        with c.app.state.fabrica_de_sessoes() as sessao:
            m = sessao.get(MovimentoDeInvestimentoModelo, UUID(movimento_id))
            if regra == "manual":
                m.origem = "manual"
            if regra in ["pendente", "ignorada"]:
                sessao.get(TransacaoImportadaModelo, m.transacao_importada_id).estado = regra
            if regra == "conta_manual":
                conta = sessao.get(ContaModelo, m.conta_id)
                conta.origem = "manual"
                conta.id_externo = None  # conta manual não tem id externo (CHECK do esquema)
            if regra == "soma":
                m.valor_centavos -= 1
            if regra in ["sem_origem", "divisao_antiga"]:
                m.transacao_importada_id = None
                m.descricao = "Sem candidata" + (" (1/2)" if regra == "divisao_antiga" else "")
            sessao.commit()
    antes = _estado_financeiro(c, dono)
    resposta = _desfazer_classificacao(c, dono, movimento_id)
    assert resposta.status_code == 409
    assert resposta.json()["erro"]["codigo"] == "movimento_nao_desfazivel"
    assert _estado_financeiro(c, dono) == antes


def test_rota_desfazer_recusa_principal_ja_realocado(cliente_dos_investimentos, dono):
    c = cliente_dos_investimentos
    investimento = _investimento(c, dono)
    movimento_id = _aportar(c, dono, "Aplicação 1", reserva=100).json()["id"]
    resposta = c.post(
        f"/investimentos/{investimento['id']}/realocacoes",
        headers=dono,
        json={
            "origem": "reserva",
            "destino": "viagem",
            "valor": "100.00",
            "data": HOJE.isoformat(),
        },
    )
    assert resposta.status_code == 201
    antes = _estado_financeiro(c, dono)
    resposta = _desfazer_classificacao(c, dono, movimento_id)
    assert resposta.status_code == 422
    assert resposta.json()["erro"]["codigo"] == "principal_insuficiente"
    assert _estado_financeiro(c, dono) == antes


def test_desfazer_movimento_antigo_sem_vinculo_com_correspondencia_segura(
    cliente_dos_investimentos, dono
):
    from uuid import UUID

    from gastoba.infrastructure.persistencia.modelos import MovimentoDeInvestimentoModelo

    c = cliente_dos_investimentos
    transacao = _caixa(c, dono)["Aplicação 1"]
    movimento_id = _aceitar(c, dono, "Aplicação 1", como_investimento=True).json()["id"]
    with c.app.state.fabrica_de_sessoes() as sessao:
        sessao.get(MovimentoDeInvestimentoModelo, UUID(movimento_id)).transacao_importada_id = None
        sessao.commit()
    resposta = _desfazer_classificacao(c, dono, movimento_id)
    assert resposta.status_code == 200
    assert resposta.json()["transacao_id"] == transacao["id"]
    assert "Aplicação 1" in _caixa(c, dono)


def test_erro_apos_excluir_divisao_faz_rollback_no_sqlite(
    cliente_dos_investimentos, dono, monkeypatch
):
    from gastoba.infrastructure.persistencia.repositorios import (
        RepositorioDeTransacoesImportadasSqlAlchemy,
    )

    c = cliente_dos_investimentos
    _, movimento_id = _divisao_com_aporte(c, dono)
    antes = _estado_financeiro(c, dono)
    original = RepositorioDeTransacoesImportadasSqlAlchemy.atualizar_estado

    def falhar(self, transacao):
        original(self, transacao)
        raise RuntimeError("Falha simulada após excluir as partes")

    monkeypatch.setattr(RepositorioDeTransacoesImportadasSqlAlchemy, "atualizar_estado", falhar)
    with pytest.raises(RuntimeError, match="Falha simulada"):
        _desfazer_classificacao(c, dono, movimento_id, json={"desfazer_divisao_inteira": True})
    assert _estado_financeiro(c, dono) == antes


class ProvedorDoExemploDoDono(ProvedorFalso):
    """LCI de R$ 12.500 com R$ 12.000 aplicados; aportes de R$ 1.800 e R$ 1.000 em caixinhas."""

    def __init__(self, valor_aplicado):
        self.valor_aplicado = valor_aplicado

    def listar_investimentos(self, id_do_item):
        return [
            InvestimentoExterno(
                "lci",
                "LCI BTG",
                "FIXED_INCOME",
                "LCI",
                Dinheiro(1250000),
                "{}",
                valor_aplicado=self.valor_aplicado,
            )
        ]

    def listar_transacoes(self, id_da_conta, desde):
        saida = SentidoDaTransacao.SAIDA
        return [
            TransacaoExterna("t1", Dinheiro(180000), "Aplicação 1", HOJE, saida, None),
            TransacaoExterna("t2", Dinheiro(100000), "Aplicação 2", HOJE, saida, None),
        ]


def _destinacoes_do_exemplo(cliente, autenticar_em, provedor, email):
    cliente.app.state.provedor_open_finance = provedor
    quem = autenticar_em(cliente, email=email, nome="Dono")
    assert cliente.post("/sincronizacoes", headers=quem).status_code == 200
    assert _aportar(cliente, quem, "Aplicação 1", reserva=100).status_code == 201
    assert _aportar(cliente, quem, "Aplicação 2", viagem=100).status_code == 201
    destinacoes = _investimento(cliente, quem)["destinacoes"]
    return {d["tag"]: (d["valor_atual"], d["rendimento"], d["principal"]) for d in destinacoes}


def test_get_investimentos_com_valor_aplicado_separa_a_parte_sem_caixinha(
    cliente_dos_investimentos, autenticar_em
):
    por_tag = _destinacoes_do_exemplo(
        cliente_dos_investimentos, autenticar_em, ProvedorDoExemploDoDono(Dinheiro(1200000)), DONO
    )

    assert por_tag["reserva"][:2] == ("1875.00", "75.00")
    assert por_tag["viagem"][:2] == ("1041.66", "41.66")
    # A parte sem caixinha fecha a tabela: principal 9.200,00 e rendimento 383,34.
    assert por_tag[None] == ("9583.34", "383.34", "9200.00")


def test_get_investimentos_sem_valor_aplicado_ratea_so_entre_as_caixinhas(
    cliente_dos_investimentos, autenticar_em
):
    por_tag = _destinacoes_do_exemplo(
        cliente_dos_investimentos, autenticar_em, ProvedorDoExemploDoDono(None), DONO
    )

    assert set(por_tag) == {"reserva", "viagem"}
    assert por_tag["reserva"][0] == "8035.72"
    assert all(tag is not None for tag in por_tag)


class ProvedorComResgates(ProvedorFalso):
    def listar_investimentos(self, id_do_item):
        # Aplicado igual ao aporte dos testes: nada fica sem caixinha e vale o custo médio puro.
        [posicao] = super().listar_investimentos(id_do_item)
        return [replace(posicao, valor_aplicado=Dinheiro(30000), rendimento=Dinheiro(11001))]

    def listar_transacoes(self, id_da_conta, desde):
        entrada = SentidoDaTransacao.ENTRADA
        return super().listar_transacoes(id_da_conta, desde) + [
            TransacaoExterna("r1", Dinheiro(8250), "Resgate parcial", HOJE, entrada, None),
            TransacaoExterna("r2", Dinheiro(20000), "Resgate grande", HOJE, entrada, None),
        ]


@pytest.fixture
def dono_com_resgates(cliente_dos_investimentos, autenticar_em):
    cliente_dos_investimentos.app.state.provedor_open_finance = ProvedorComResgates()
    quem = autenticar_em(cliente_dos_investimentos, email=DONO, nome="Dono")
    assert cliente_dos_investimentos.post("/sincronizacoes", headers=quem).status_code == 200
    return quem


def _guardar_saldo_de_ontem(cliente, investimento_id, saldo: str):
    fabrica = cliente.app.state.fabrica_de_sessoes
    with fabrica() as sessao:
        sessao.add(
            HistoricoDeInvestimentoModelo(
                id=uuid4(),
                investimento_id=UUID(investimento_id),
                data=HOJE - timedelta(days=1),
                saldo_centavos=Dinheiro.de_reais(Decimal(saldo)).centavos,
            )
        )
        sessao.commit()


def _resgatar(cliente, quem, descricao, **percentuais):
    investimento = _investimento(cliente, quem)
    transacao = _caixa(cliente, quem)[descricao]
    return cliente.post(
        f"/transacoes-importadas/{transacao['id']}/aceitar",
        json={
            "como_investimento": True,
            "investimento_id": investimento["id"],
            "destinacoes": [{"tag": t, "percentual": p} for t, p in percentuais.items()],
        },
        headers=quem,
    )


def _preparar(cliente, quem):
    assert _aportar(cliente, quem, "Aplicação 1", casa=50, viagem=50).status_code == 201
    _guardar_saldo_de_ontem(cliente, _investimento(cliente, quem)["id"], "330.00")


def test_resgate_abate_o_principal_por_custo_medio(cliente_dos_investimentos, dono_com_resgates):
    c = cliente_dos_investimentos
    dono = dono_com_resgates
    _preparar(c, dono)

    # Cada tag valia 165,00 (principal 150,00); resgatar 82,50 é metade da tag.
    resposta = _resgatar(c, dono, "Resgate parcial", viagem=100)

    assert resposta.status_code == 201
    assert resposta.json()["tipo"] == "resgate"
    destinacoes = _investimento(c, dono)["destinacoes"]
    principais = {d["tag"]: d["principal"] for d in destinacoes if d["tag"] is not None}
    assert principais == {"casa": "150.00", "viagem": "75.00"}
    periodo = {"inicio": HOJE.isoformat(), "fim": HOJE.isoformat()}
    movimentos = c.get("/movimentos-de-investimento", params=periodo, headers=dono).json()
    resgate = next(m for m in movimentos if m["tipo"] == "resgate")
    assert resgate["valor"] == "82.50"


def test_resgate_maior_que_o_valor_da_tag_da_422_no_formato_unico(
    cliente_dos_investimentos, dono_com_resgates
):
    c = cliente_dos_investimentos
    dono = dono_com_resgates
    _preparar(c, dono)

    resposta = _resgatar(c, dono, "Resgate grande", viagem=100)

    assert resposta.status_code == 422
    erro = resposta.json()["erro"]
    assert erro["codigo"] == "resgate_maior_que_o_valor"
    assert "viagem" in erro["mensagem"]
    principais = {d["tag"]: d["principal"] for d in _investimento(c, dono)["destinacoes"]}
    assert principais == {"casa": "150.00", "viagem": "150.00"}
    assert _caixa(c, dono)["Resgate grande"]["estado"] == "pendente"


def test_outra_pessoa_nao_resgata_nem_mexe_no_investimento_do_dono(
    cliente_dos_investimentos, dono_com_resgates, outra_pessoa
):
    c = cliente_dos_investimentos
    dono = dono_com_resgates
    _preparar(c, dono)
    investimento = _investimento(c, dono)
    transacao = _caixa(c, dono)["Resgate parcial"]

    aceitar = c.post(
        f"/transacoes-importadas/{transacao['id']}/aceitar",
        json={
            "como_investimento": True,
            "investimento_id": investimento["id"],
            "destinacoes": [{"tag": "viagem", "percentual": 100}],
        },
        headers=outra_pessoa,
    )
    realocar = c.post(
        f"/investimentos/{investimento['id']}/realocacoes",
        json={"origem": "viagem", "destino": "casa", "percentual": 10, "data": HOJE.isoformat()},
        headers=outra_pessoa,
    )

    assert aceitar.status_code == 404
    assert aceitar.json()["erro"]["codigo"] == "importacao_desligada"
    assert realocar.status_code == 404
    assert realocar.json()["erro"]["codigo"] == "investimento_nao_encontrado"
    assert c.get("/investimentos", headers=outra_pessoa).json() == []
    principais = {d["tag"]: d["principal"] for d in _investimento(c, dono)["destinacoes"]}
    assert principais == {"casa": "150.00", "viagem": "150.00"}
    assert _caixa(c, dono)["Resgate parcial"]["estado"] == "pendente"


def test_caixinha_expoe_fk_da_conta_no_resumo(cliente_dos_investimentos, dono):
    cliente = cliente_dos_investimentos
    conta = cliente.get("/contas", headers=dono).json()[0]
    resposta = cliente.post(
        "/caixinhas",
        headers=dono,
        json={"conta_id": conta["id"], "saldo_remunerado": "962.17", "data_do_saldo": "2026-11-08"},
    )
    assert resposta.status_code == 200
    posicao = next(
        i for i in cliente.get("/investimentos", headers=dono).json() if i["tipo"] == "CAIXINHA"
    )
    assert posicao["conta_id"] == conta["id"]
    assert posicao["saldo"] == "962.17"
    assert posicao["atualizado_em"] == "2026-11-08"
    # 071: só o saldo do banco, sem principal nem rendimento estimados por movimentos.
    assert posicao["valor_aplicado"] is None and posicao["rendimento"] is None
    assert posicao["origem_da_rentabilidade"] is None
    assert [(d["tag"], d["valor_atual"]) for d in posicao["destinacoes"]] == [(None, "962.17")]


def test_vencimento_confirmado_no_sino_com_isolamento(
    cliente_dos_investimentos, dono, outra_pessoa
):
    cliente = cliente_dos_investimentos
    from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
    from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy

    investimento = _investimento(cliente, dono)
    conta = cliente.get("/contas", headers=dono).json()[0]
    resgate = MovimentoDeInvestimento(
        UUID(conta["id"]),
        TipoDeMovimento.RESGATE,
        Dinheiro(500000),
        "Entrada fictícia",
        date(2026, 10, 26),
        UUID(investimento["id"]),
    )
    with UnidadeDeTrabalhoSqlAlchemy(cliente.app.state.fabrica_de_sessoes) as uow:
        uow.movimentos_de_investimento.adicionar(resgate)
        uow.commit()
    id_ = str(resgate.id)
    rota = f"/movimentos-de-investimento/{id_}/natureza-do-resgate"
    chave = cliente.post(
        "/chaves-de-api", headers=dono, json={"nome": "Teste", "escopo": "escrita"}
    ).json()
    assert (
        cliente.put(
            rota,
            headers={"Authorization": f"Bearer {chave['segredo']}"},
            json={"tipo": "vencimento"},
        ).status_code
        == 403
    )
    cookie = {"Cookie": "gastoba_sessao=" + dono["Authorization"].removeprefix("Bearer ")}
    assert cliente.put(rota, headers=cookie, json={"tipo": "vencimento"}).status_code == 403
    assert cliente.put(rota, headers=outra_pessoa, json={"tipo": "vencimento"}).status_code == 404
    assert cliente.put(rota, headers=dono, json={"tipo": "outro"}).status_code == 422
    assert cliente.put(rota, headers=dono, json={"tipo": "vencimento"}).status_code == 204
    # Posição sem principal em caixinhas: o vencimento confirmado não tem mais o que decidir (D2).
    assert id_ not in [
        i["id"] for i in cliente.get("/resgates-sem-destinacao", headers=dono).json()
    ]
    assert cliente.put(rota, headers=dono, json={"tipo": "resgate"}).status_code == 204
    assert (
        next(
            i
            for i in cliente.get("/resgates-sem-destinacao", headers=dono).json()
            if i["id"] == id_
        )["tipo"]
        == "resgate"
    )


# --- 072: realocar entre caixinhas numa posição por fração ---------------------------------


def _posicao_por_fracao(cliente, quem, **pesos):
    """Dá à primeira posição do dono pesos de caixinha (o modelo por fração da 060)."""
    investimento = _investimento(cliente, quem)
    usuario_id = UUID(cliente.get("/auth/eu", headers=quem).json()["id"])
    posicao_id = UUID(investimento["id"])
    fabrica = cliente.app.state.fabrica_de_sessoes
    with fabrica() as sessao:
        for tag in ("reserva", "viagem", "celular"):
            sessao.add(CadastroDeDestinacaoModelo(id=uuid4(), usuario_id=usuario_id, nome=tag))
        sessao.commit()
    uow = UnidadeDeTrabalhoSqlAlchemy(fabrica)
    with uow:
        ids = uow.alocacoes.ids_das_tags(usuario_id)
        uow.operacoes.garantir_posicao(usuario_id, posicao_id)
        uow.alocacoes.substituir(
            usuario_id,
            posicao_id,
            [AlocacaoDeCaixinha(posicao_id, ids[Tag(t)], p) for t, p in pesos.items()],
        )
        uow.commit()
    return investimento["id"]


def _principais(cliente, quem):
    return {
        d["tag"]: d["principal"]
        for d in _investimento(cliente, quem)["destinacoes"]
        if d["tag"] is not None
    }


def test_realocar_na_fracao_muda_a_divisao_lista_e_desfaz(cliente_dos_investimentos, dono, caplog):
    c = cliente_dos_investimentos
    investimento_id = _posicao_por_fracao(c, dono, reserva=24600, viagem=16401)
    antes = _investimento(c, dono)

    resposta = c.post(
        f"/investimentos/{investimento_id}/realocacoes",
        json={"origem": "Reserva", "destino": "celular", "valor": "100.00", "data": "2026-11-05"},
        headers=dono,
    )

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert (corpo["origem"], corpo["destino"], corpo["valor"], corpo["data"]) == (
        "reserva",
        "celular",
        "100.00",
        "2026-11-05",
    )
    assert _principais(c, dono) == {"reserva": "146.00", "viagem": "164.01", "celular": "100.00"}
    assert _investimento(c, dono)["saldo"] == antes["saldo"]
    assert "100.00" not in caplog.text and "celular" not in caplog.text
    lista = c.get(f"/investimentos/{investimento_id}/realocacoes", headers=dono).json()
    assert [(r["id"], r["origem"], r["destino"]) for r in lista] == [
        (corpo["id"], "reserva", "celular")
    ]

    desfeita = c.delete(f"/investimentos/{investimento_id}/realocacoes/{corpo['id']}", headers=dono)

    assert desfeita.status_code == 204
    assert _principais(c, dono) == {"reserva": "246.00", "viagem": "164.01"}
    assert c.get(f"/investimentos/{investimento_id}/realocacoes", headers=dono).json() == []


def test_realocar_na_fracao_por_percentual_e_erros(cliente_dos_investimentos, dono):
    c = cliente_dos_investimentos
    investimento_id = _posicao_por_fracao(c, dono, reserva=20000, viagem=21001)
    url = f"/investimentos/{investimento_id}/realocacoes"

    def realocar(**corpo):
        return c.post(url, json={"data": HOJE.isoformat(), **corpo}, headers=dono)

    assert realocar(origem="reserva", destino="viagem", percentual=100).status_code == 201
    assert _principais(c, dono) == {"viagem": "410.01"}
    acima = realocar(origem="viagem", destino="reserva", valor="410.02")
    assert (acima.status_code, acima.json()["erro"]["codigo"]) == (422, "principal_insuficiente")
    sem_fracao = realocar(origem="celular", destino="reserva", valor="1.00")
    assert sem_fracao.json()["erro"]["codigo"] == "principal_insuficiente"
    destino_novo = realocar(origem="viagem", destino="inexistente", valor="1.00")
    assert (destino_novo.status_code, destino_novo.json()["erro"]["codigo"]) == (
        422,
        "destinacao_invalida",
    )
    assert _principais(c, dono) == {"viagem": "410.01"}


def test_nao_desfaz_realocacao_da_fracao_cujo_destino_ja_foi_usado(cliente_dos_investimentos, dono):
    c = cliente_dos_investimentos
    investimento_id = _posicao_por_fracao(c, dono, reserva=41001)
    url = f"/investimentos/{investimento_id}/realocacoes"
    primeira = c.post(
        url,
        json={"origem": "reserva", "destino": "viagem", "valor": "100.00", "data": "2026-11-01"},
        headers=dono,
    ).json()
    c.post(
        url,
        json={"origem": "viagem", "destino": "celular", "valor": "60.00", "data": "2026-11-02"},
        headers=dono,
    )

    recusa = c.delete(f"{url}/{primeira['id']}", headers=dono)

    assert (recusa.status_code, recusa.json()["erro"]["codigo"]) == (422, "principal_insuficiente")
    assert _principais(c, dono) == {"reserva": "310.01", "viagem": "40.00", "celular": "60.00"}


def test_realocacao_da_fracao_de_outra_pessoa_e_credenciais(
    cliente_dos_investimentos, dono, outra_pessoa
):
    c = cliente_dos_investimentos
    investimento_id = _posicao_por_fracao(c, dono, reserva=41001)
    url = f"/investimentos/{investimento_id}/realocacoes"
    corpo = {"origem": "reserva", "destino": "viagem", "valor": "1.00", "data": HOJE.isoformat()}
    feita = c.post(url, json=corpo, headers=dono).json()

    assert c.post(url, json=corpo, headers=outra_pessoa).status_code == 404
    assert c.get(url, headers=outra_pessoa).status_code == 404
    assert c.delete(f"{url}/{feita['id']}", headers=outra_pessoa).status_code == 404

    segredo = c.post(
        "/chaves-de-api", json={"nome": "leitura", "escopo": "leitura"}, headers=dono
    ).json()["segredo"]
    so_leitura = {"Authorization": f"Bearer {segredo}"}
    assert c.get(url, headers=so_leitura).status_code == 200
    negado = c.post(url, json=corpo, headers=so_leitura)
    assert (negado.status_code, negado.json()["erro"]["codigo"]) == (403, "acesso_negado")
    assert c.delete(f"{url}/{feita['id']}", headers=so_leitura).status_code == 403

    sessao = dono["Authorization"].removeprefix("Bearer ")
    c.cookies.set("gastoba_sessao", sessao)
    try:
        sem_csrf = c.post(url, json=corpo)
    finally:
        c.cookies.clear()
    assert (sem_csrf.status_code, sem_csrf.json()["erro"]["codigo"]) == (
        403,
        "requisicao_invalida_origem",
    )
    assert _principais(c, dono) == {"reserva": "409.01", "viagem": "1.00"}
