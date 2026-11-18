"""Rotas da importação bancária, com um provedor falso no lugar da Pluggy (Art. VI.4)."""

from datetime import date
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from gastoba.api.app import criar_app
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ProvedorIndisponivel
from gastoba.domain.portas import ContaExterna, TransacaoExterna
from gastoba.domain.transacao_importada import SentidoDaTransacao
from gastoba.infrastructure.persistencia.banco import criar_engine
from gastoba.infrastructure.persistencia.modelos import Base
from gastoba.infrastructure.seguranca.hasher_de_senha_scrypt import HasherDeSenhaScrypt

DONO = "dono@x.com"
HOJE = date.today()


class ProvedorFalso:
    def __init__(self):
        self.falhar = False
        self.chamadas = 0

    def listar_contas(self, id_do_item):
        self.chamadas += 1
        if self.falhar:
            raise ProvedorIndisponivel("fora do ar")
        return [ContaExterna("c1", "Conta Corrente", Dinheiro(150000))]

    def listar_operacoes_do_investimento(self, id_do_investimento):
        return []

    def listar_investimentos(self, id_do_item):
        return []

    def listar_transacoes(self, id_da_conta, desde):
        return [
            TransacaoExterna(
                "t1", Dinheiro(2590), "Mercado", HOJE, SentidoDaTransacao.SAIDA, "PIX"
            ),
            TransacaoExterna(
                "t2", Dinheiro(500000), "Salário", HOJE, SentidoDaTransacao.ENTRADA, None
            ),
            TransacaoExterna(
                "t3", Dinheiro(1990), "Estorno da loja", HOJE, SentidoDaTransacao.ENTRADA, "ESTORNO"
            ),
            # Descartadas na importação: entram já ignoradas.
            TransacaoExterna(
                "t4",
                Dinheiro(30000),
                "Pagamento recebido",
                HOJE,
                SentidoDaTransacao.ENTRADA,
                "PAGAMENTO_FATURA",
            ),
            TransacaoExterna(
                "t5",
                Dinheiro(10000),
                "Transferência",
                HOJE,
                SentidoDaTransacao.SAIDA,
                "TRANSFERENCIA_MESMA_INSTITUICAO",
            ),
        ]


@pytest.fixture
def configuracoes_com_pluggy(configuracoes_teste):
    return configuracoes_teste.model_copy(
        update={
            "pluggy_client_id": "id",
            "pluggy_client_secret": SecretStr("segredo"),
            "pluggy_item_ids": ["item-1"],
            "pluggy_email_do_dono": DONO,
            "pluggy_intervalo_horas": 0,
        }
    )


@pytest.fixture
def provedor():
    return ProvedorFalso()


@pytest.fixture
def cliente_da_importacao(configuracoes_com_pluggy, provedor):
    # O esquema vem dos modelos (sem migrations), criado antes de subir a app.
    engine = criar_engine(configuracoes_com_pluggy.url_banco)
    Base.metadata.create_all(engine)
    engine.dispose()
    app = criar_app(configuracoes_com_pluggy)
    # scrypt barato nos testes, como na fixture `cliente`.
    app.state.hasher_de_senha = HasherDeSenhaScrypt(n=2, r=1, p=1)
    app.state.provedor_open_finance = provedor
    with TestClient(app, base_url="http://localhost") as cliente:
        yield cliente


@pytest.fixture
def dono(cliente_da_importacao, autenticar_em):
    return autenticar_em(cliente_da_importacao, email=DONO, nome="Dono")


def _sincronizar(cliente, quem):
    resposta = cliente.post("/sincronizacoes", headers=quem)
    assert resposta.status_code == 200
    return resposta.json()


def _caixa(cliente, quem, **parametros):
    return cliente.get("/transacoes-importadas", params=parametros, headers=quem).json()


def _por_id_externo(caixa, descricao):
    return next(t for t in caixa if t["descricao"] == descricao)


def test_sincronizar_traz_a_conta_e_enche_a_caixa_de_entrada(cliente_da_importacao, dono):
    resultado = _sincronizar(cliente_da_importacao, dono)

    assert resultado == {"contas": 1, "transacoes_novas": 3, "falhas": 0}
    contas = cliente_da_importacao.get("/contas", headers=dono).json()
    assert [(c["nome"], c["saldo"], c["origem"], c["tipo"]) for c in contas] == [
        ("Conta Corrente", "1500.00", "open_finance", "corrente")
    ]
    caixa = _caixa(cliente_da_importacao, dono)
    assert len(caixa) == 3
    mercado = _por_id_externo(caixa, "Mercado")
    assert mercado["valor"] == "25.90"
    assert mercado["sentido"] == "saida"
    assert mercado["estado"] == "pendente"
    assert mercado["tipo_de_operacao"] == "PIX"
    assert mercado["sugerir_descarte"] is False
    assert _por_id_externo(caixa, "Estorno da loja")["sugerir_descarte"] is True


def test_transferencia_e_pagamento_de_fatura_entram_ja_ignorados(cliente_da_importacao, dono):
    resultado = _sincronizar(cliente_da_importacao, dono)

    assert resultado["transacoes_novas"] == 3
    pendentes = {t["descricao"] for t in _caixa(cliente_da_importacao, dono)}
    assert pendentes == {"Mercado", "Salário", "Estorno da loja"}
    ignoradas = _caixa(cliente_da_importacao, dono, estado="ignorada")
    assert {t["descricao"] for t in ignoradas} == {"Pagamento recebido", "Transferência"}
    assert {t["estado"] for t in ignoradas} == {"ignorada"}

    assert _sincronizar(cliente_da_importacao, dono)["transacoes_novas"] == 0
    assert len(_caixa(cliente_da_importacao, dono, estado="ignorada")) == 2


def test_sincronizar_de_novo_nao_duplica(cliente_da_importacao, dono):
    _sincronizar(cliente_da_importacao, dono)

    resultado = _sincronizar(cliente_da_importacao, dono)

    assert resultado["transacoes_novas"] == 0
    assert len(_caixa(cliente_da_importacao, dono)) == 3
    assert len(cliente_da_importacao.get("/contas", headers=dono).json()) == 1


def test_falha_do_provedor_e_contada_e_nao_derruba_a_rota(cliente_da_importacao, dono, provedor):
    provedor.falhar = True

    assert _sincronizar(cliente_da_importacao, dono) == {
        "contas": 0,
        "transacoes_novas": 0,
        "falhas": 1,
    }


def test_aceitar_saida_cria_o_gasto_sem_mexer_no_saldo(cliente_da_importacao, dono):
    _sincronizar(cliente_da_importacao, dono)
    mercado = _por_id_externo(_caixa(cliente_da_importacao, dono), "Mercado")

    resposta = cliente_da_importacao.post(
        f"/transacoes-importadas/{mercado['id']}/aceitar",
        json={"categoria": "conforto", "tags": ["Pix", "mercado"]},
        headers=dono,
    )

    assert resposta.status_code == 201
    assert resposta.json()["tipo"] == "gasto"
    gastos = cliente_da_importacao.get(
        "/gastos",
        params={"inicio": HOJE.isoformat(), "fim": HOJE.isoformat()},
        headers=dono,
    ).json()
    assert [(g["descricao"], g["valor"], g["categoria"], g["origem"]) for g in gastos] == [
        ("Mercado", "25.90", "conforto", "open_finance")
    ]
    assert gastos[0]["tags"] == ["pix", "mercado"]
    assert cliente_da_importacao.get("/contas", headers=dono).json()[0]["saldo"] == "1500.00"
    assert len(_caixa(cliente_da_importacao, dono)) == 2


def test_aceitar_entrada_cria_o_ganho(cliente_da_importacao, dono):
    _sincronizar(cliente_da_importacao, dono)
    salario = _por_id_externo(_caixa(cliente_da_importacao, dono), "Salário")

    resposta = cliente_da_importacao.post(
        f"/transacoes-importadas/{salario['id']}/aceitar", json={}, headers=dono
    )

    assert resposta.status_code == 201
    assert resposta.json()["tipo"] == "ganho"
    ganhos = cliente_da_importacao.get(
        "/ganhos",
        params={"inicio": HOJE.isoformat(), "fim": HOJE.isoformat()},
        headers=dono,
    ).json()
    assert [(g["descricao"], g["valor"]) for g in ganhos] == [("Salário", "5000.00")]


def test_excluir_o_ganho_aceito_da_caixa_devolve_a_transacao_a_caixa(cliente_da_importacao, dono):
    _sincronizar(cliente_da_importacao, dono)
    salario = _por_id_externo(_caixa(cliente_da_importacao, dono), "Salário")
    ganho_id = cliente_da_importacao.post(
        f"/transacoes-importadas/{salario['id']}/aceitar", json={}, headers=dono
    ).json()["id"]
    assert salario["id"] not in [t["id"] for t in _caixa(cliente_da_importacao, dono)]

    resposta = cliente_da_importacao.delete(f"/ganhos/{ganho_id}", headers=dono)

    assert resposta.status_code == 204
    volta = _por_id_externo(_caixa(cliente_da_importacao, dono), "Salário")
    assert volta["id"] == salario["id"]
    assert volta["estado"] == "pendente"
    # Decidir de novo funciona e cria um único ganho.
    cliente_da_importacao.post(
        f"/transacoes-importadas/{salario['id']}/aceitar", json={}, headers=dono
    )
    ganhos = cliente_da_importacao.get(
        "/ganhos",
        params={"inicio": HOJE.isoformat(), "fim": HOJE.isoformat()},
        headers=dono,
    ).json()
    assert [g["descricao"] for g in ganhos] == ["Salário"]


def test_aceitar_como_investimento_vira_aporte_e_nao_gasto_nem_ganho(cliente_da_importacao, dono):
    _sincronizar(cliente_da_importacao, dono)
    caixa = _caixa(cliente_da_importacao, dono)
    mercado = _por_id_externo(caixa, "Mercado")
    salario = _por_id_externo(caixa, "Salário")
    periodo = {"inicio": HOJE.isoformat(), "fim": HOJE.isoformat()}

    aporte = cliente_da_importacao.post(
        f"/transacoes-importadas/{mercado['id']}/aceitar",
        json={"como_investimento": True},
        headers=dono,
    )
    resgate = cliente_da_importacao.post(
        f"/transacoes-importadas/{salario['id']}/aceitar",
        json={"como_investimento": True},
        headers=dono,
    )

    assert (aporte.status_code, aporte.json()["tipo"]) == (201, "aporte")
    assert (resgate.status_code, resgate.json()["tipo"]) == (201, "resgate")
    assert cliente_da_importacao.get("/gastos", params=periodo, headers=dono).json() == []
    assert cliente_da_importacao.get("/ganhos", params=periodo, headers=dono).json() == []
    assert cliente_da_importacao.get("/contas", headers=dono).json()[0]["saldo"] == "1500.00"
    assert len(_caixa(cliente_da_importacao, dono)) == 1


def test_recusa_aporte_com_categoria_de_despesa(cliente_da_importacao, dono):
    _sincronizar(cliente_da_importacao, dono)
    mercado = _por_id_externo(_caixa(cliente_da_importacao, dono), "Mercado")
    resposta = cliente_da_importacao.post(
        f"/transacoes-importadas/{mercado['id']}/aceitar",
        json={"como_investimento": True, "categoria": "lazer"},
        headers=dono,
    )
    assert resposta.status_code == 422
    assert resposta.json()["erro"]["codigo"] == "transacao_importada_invalida"
    assert mercado["id"] in {t["id"] for t in _caixa(cliente_da_importacao, dono)}


def test_aceitar_saida_sem_categoria_e_entrada_com_categoria_dao_422(cliente_da_importacao, dono):
    _sincronizar(cliente_da_importacao, dono)
    caixa = _caixa(cliente_da_importacao, dono)
    mercado = _por_id_externo(caixa, "Mercado")
    salario = _por_id_externo(caixa, "Salário")

    sem_categoria = cliente_da_importacao.post(
        f"/transacoes-importadas/{mercado['id']}/aceitar", json={}, headers=dono
    )
    com_categoria = cliente_da_importacao.post(
        f"/transacoes-importadas/{salario['id']}/aceitar",
        json={"categoria": "lazer"},
        headers=dono,
    )

    assert sem_categoria.status_code == 422
    assert sem_categoria.json()["erro"]["codigo"] == "transacao_importada_invalida"
    assert com_categoria.status_code == 422
    assert len(_caixa(cliente_da_importacao, dono)) == 3


def test_ignorar_tira_da_caixa_e_nao_cria_lancamento(cliente_da_importacao, dono):
    _sincronizar(cliente_da_importacao, dono)
    estorno = _por_id_externo(_caixa(cliente_da_importacao, dono), "Estorno da loja")

    resposta = cliente_da_importacao.post(
        f"/transacoes-importadas/{estorno['id']}/ignorar", headers=dono
    )

    assert resposta.status_code == 204
    assert len(_caixa(cliente_da_importacao, dono)) == 2
    ignoradas = _caixa(cliente_da_importacao, dono, estado="ignorada")
    assert "Estorno da loja" in {t["descricao"] for t in ignoradas}
    ganhos = cliente_da_importacao.get(
        "/ganhos", params={"inicio": "2000-01-01", "fim": "2999-12-31"}, headers=dono
    ).json()
    assert ganhos == []


def test_tratar_duas_vezes_da_409_e_inexistente_da_404(cliente_da_importacao, dono):
    _sincronizar(cliente_da_importacao, dono)
    mercado = _por_id_externo(_caixa(cliente_da_importacao, dono), "Mercado")
    url = f"/transacoes-importadas/{mercado['id']}/ignorar"
    cliente_da_importacao.post(url, headers=dono)

    de_novo = cliente_da_importacao.post(url, headers=dono)
    aceitar = cliente_da_importacao.post(
        f"/transacoes-importadas/{mercado['id']}/aceitar",
        json={"categoria": "lazer"},
        headers=dono,
    )
    inexistente = cliente_da_importacao.post(
        "/transacoes-importadas/3f2b8a52-1c1e-4a55-9d3e-3a8f1b6c9d10/ignorar", headers=dono
    )

    assert de_novo.status_code == 409
    assert de_novo.json()["erro"]["codigo"] == "transacao_ja_tratada"
    assert aceitar.status_code == 409
    assert inexistente.status_code == 404
    assert inexistente.json()["erro"]["codigo"] == "transacao_importada_nao_encontrada"


def test_restaurar_devolve_a_ignorada_a_caixa_sem_lancamento_nem_saldo(cliente_da_importacao, dono):
    _sincronizar(cliente_da_importacao, dono)
    estorno = _por_id_externo(_caixa(cliente_da_importacao, dono), "Estorno da loja")
    cliente_da_importacao.post(f"/transacoes-importadas/{estorno['id']}/ignorar", headers=dono)
    saldo_antes = cliente_da_importacao.get("/contas", headers=dono).json()[0]["saldo"]

    resposta = cliente_da_importacao.post(
        f"/transacoes-importadas/{estorno['id']}/restaurar", headers=dono
    )

    assert resposta.status_code == 204
    restaurada = _por_id_externo(_caixa(cliente_da_importacao, dono), "Estorno da loja")
    assert restaurada == {**estorno, "estado": "pendente"}
    ignoradas = _caixa(cliente_da_importacao, dono, estado="ignorada")
    assert "Estorno da loja" not in {t["descricao"] for t in ignoradas}
    periodo = {"inicio": "2000-01-01", "fim": "2999-12-31"}
    assert cliente_da_importacao.get("/ganhos", params=periodo, headers=dono).json() == []
    assert cliente_da_importacao.get("/gastos", params=periodo, headers=dono).json() == []
    movimentos = cliente_da_importacao.get(
        "/movimentos-de-investimento", params=periodo, headers=dono
    ).json()
    assert movimentos == []
    assert cliente_da_importacao.get("/contas", headers=dono).json()[0]["saldo"] == saldo_antes


def test_restaurar_fora_de_ignorada_da_409_e_inexistente_da_404(cliente_da_importacao, dono):
    _sincronizar(cliente_da_importacao, dono)
    caixa = _caixa(cliente_da_importacao, dono)
    pendente = _por_id_externo(caixa, "Mercado")
    aceita = _por_id_externo(caixa, "Salário")
    cliente_da_importacao.post(
        f"/transacoes-importadas/{aceita['id']}/aceitar", json={}, headers=dono
    )

    da_pendente = cliente_da_importacao.post(
        f"/transacoes-importadas/{pendente['id']}/restaurar", headers=dono
    )
    da_aceita = cliente_da_importacao.post(
        f"/transacoes-importadas/{aceita['id']}/restaurar", headers=dono
    )
    inexistente = cliente_da_importacao.post(
        "/transacoes-importadas/3f2b8a52-1c1e-4a55-9d3e-3a8f1b6c9d10/restaurar", headers=dono
    )

    assert [da_pendente.status_code, da_aceita.status_code] == [409, 409]
    assert {da_pendente.json()["erro"]["codigo"], da_aceita.json()["erro"]["codigo"]} == {
        "transacao_ja_tratada"
    }
    assert inexistente.status_code == 404
    assert inexistente.json()["erro"]["codigo"] == "transacao_importada_nao_encontrada"
    estados = {t["descricao"]: t["estado"] for t in _caixa(cliente_da_importacao, dono)}
    assert estados["Mercado"] == "pendente"
    assert "Salário" not in estados


def test_restaurar_so_para_a_dona_e_nao_alcanca_a_de_outra_pessoa(
    cliente_da_importacao, dono, autenticar_em
):
    outra = autenticar_em(cliente_da_importacao, email="outra@x.com", nome="Outra")
    _sincronizar(cliente_da_importacao, dono)
    estorno = _por_id_externo(_caixa(cliente_da_importacao, dono), "Estorno da loja")
    cliente_da_importacao.post(f"/transacoes-importadas/{estorno['id']}/ignorar", headers=dono)

    resposta = cliente_da_importacao.post(
        f"/transacoes-importadas/{estorno['id']}/restaurar", headers=outra
    )

    assert resposta.status_code == 404
    assert resposta.json()["erro"]["codigo"] == "importacao_desligada"
    ignoradas = _caixa(cliente_da_importacao, dono, estado="ignorada")
    assert "Estorno da loja" in {t["descricao"] for t in ignoradas}


def test_sinaliza_possivel_duplicado_de_lancamento_manual(cliente_da_importacao, dono):
    _sincronizar(cliente_da_importacao, dono)
    conta = cliente_da_importacao.get("/contas", headers=dono).json()[0]["id"]
    cliente_da_importacao.post(
        "/gastos",
        json={
            "conta_id": conta,
            "valor": "25.90",
            "descricao": "Pix mercado",
            "data": HOJE.isoformat(),
            "categoria": "conforto",
            "tags": [],
        },
        headers=dono,
    )

    caixa = _caixa(cliente_da_importacao, dono)

    assert _por_id_externo(caixa, "Mercado")["possivel_duplicado"] is True
    assert _por_id_externo(caixa, "Salário")["possivel_duplicado"] is False
    # Lançar à mão numa conta importada não mexe no saldo, que é o do banco.
    assert cliente_da_importacao.get("/contas", headers=dono).json()[0]["saldo"] == "1500.00"


def test_so_a_dona_ve_o_recurso_as_outras_pessoas_recebem_404(
    cliente_da_importacao, dono, autenticar_em
):
    outra = autenticar_em(cliente_da_importacao, email="outra@x.com", nome="Outra")
    _sincronizar(cliente_da_importacao, dono)
    mercado = _por_id_externo(_caixa(cliente_da_importacao, dono), "Mercado")

    respostas = [
        cliente_da_importacao.get("/transacoes-importadas", headers=outra),
        cliente_da_importacao.post("/sincronizacoes", headers=outra),
        cliente_da_importacao.post(
            f"/transacoes-importadas/{mercado['id']}/aceitar",
            json={"categoria": "lazer"},
            headers=outra,
        ),
        cliente_da_importacao.post(
            f"/transacoes-importadas/{mercado['id']}/ignorar", headers=outra
        ),
    ]

    assert [r.status_code for r in respostas] == [404, 404, 404, 404]
    assert {r.json()["erro"]["codigo"] for r in respostas} == {"importacao_desligada"}
    assert cliente_da_importacao.get("/contas", headers=outra).json() == []


def test_com_a_importacao_desligada_as_rotas_nao_existem_nem_para_a_dona(cliente, autenticar):
    quem = autenticar(email=DONO, nome="Dono")

    resposta = cliente.get("/transacoes-importadas", headers=quem)

    assert resposta.status_code == 404
    assert resposta.json()["erro"]["codigo"] == "importacao_desligada"


def test_eu_informa_se_a_pessoa_e_a_dona_da_importacao(cliente_da_importacao, dono, autenticar_em):
    outra = autenticar_em(cliente_da_importacao, email="outra@x.com", nome="Outra")

    assert cliente_da_importacao.get("/auth/eu", headers=dono).json()["importacao_bancaria"] is True
    assert (
        cliente_da_importacao.get("/auth/eu", headers=outra).json()["importacao_bancaria"] is False
    )

    assert (
        cliente_da_importacao.get("/auth/eu", headers=dono).json().get("gestao_de_investimentos")
        is True
    )
    assert (
        cliente_da_importacao.get("/auth/eu", headers=outra).json().get("gestao_de_investimentos")
        is False
    )


def test_chave_de_leitura_nao_sincroniza_nem_aceita(cliente_da_importacao, dono):
    segredo = cliente_da_importacao.post(
        "/chaves-de-api", json={"nome": "leitura", "escopo": "leitura"}, headers=dono
    ).json()["segredo"]
    chave = {"Authorization": f"Bearer {segredo}"}

    leitura = cliente_da_importacao.get("/transacoes-importadas", headers=chave)
    escrita = cliente_da_importacao.post("/sincronizacoes", headers=chave)

    assert leitura.status_code == 200
    assert escrita.status_code == 403


@pytest.mark.parametrize("descricao,categoria", [("Mercado", "lazer"), ("Salário", None)])
def test_desfaz_classificacao_pela_transacao_com_previa_e_auditoria(
    cliente_da_importacao, dono, descricao, categoria
):
    from sqlalchemy import select

    from gastoba.infrastructure.persistencia.modelos import ReversaoDeClassificacaoModelo

    c = cliente_da_importacao
    _sincronizar(c, dono)
    t = _por_id_externo(_caixa(c, dono), descricao)
    assert (
        c.post(
            f"/transacoes-importadas/{t['id']}/aceitar",
            headers=dono,
            json={"categoria": categoria, "tags": ["exemplo"]},
        ).status_code
        == 201
    )
    url = f"/transacoes-importadas/{t['id']}"
    previa = c.get(url + "/impacto-da-reversao", headers=dono)
    assert previa.status_code == 200
    assert previa.json()["lancamentos_removidos"] == 1
    dados = {"versao_esperada": previa.json()["versao"]}
    assert c.post(url + "/desfazer-classificacao", headers=dono, json=dados).status_code == 200
    assert t["id"] in {item["id"] for item in _caixa(c, dono)}
    assert c.get("/contas", headers=dono).json()[0]["saldo"] == "1500.00"
    assert c.post(url + "/desfazer-classificacao", headers=dono, json=dados).status_code == 409
    with c.app.state.fabrica_de_sessoes() as sessao:
        auditoria = sessao.scalars(select(ReversaoDeClassificacaoModelo)).all()
        assert len(auditoria) == 1
        assert auditoria[0].lancamentos[0]["tags"] == ["exemplo"]


def test_reversao_recusa_previa_obsoleta_e_pessoa_alheia(
    cliente_da_importacao, dono, autenticar_em
):
    c = cliente_da_importacao
    _sincronizar(c, dono)
    t = _por_id_externo(_caixa(c, dono), "Mercado")
    c.post(
        f"/transacoes-importadas/{t['id']}/aceitar",
        headers=dono,
        json={"categoria": "lazer", "tags": []},
    )
    url = f"/transacoes-importadas/{t['id']}/desfazer-classificacao"
    assert c.post(url, headers=dono, json={"versao_esperada": "obsoleta"}).status_code == 409
    outro = autenticar_em(c, email="outra@x.com", nome="Outra")
    assert c.post(url, headers=outro, json={}).status_code == 404


def test_transferencia_pareada_conta_uma_vez_e_reversao_reabre_as_duas_pontas(
    cliente_da_importacao, dono, provedor
):
    from datetime import timedelta

    provedor.listar_contas = lambda _: [
        ContaExterna("c1", "Corrente", Dinheiro(10000)),
        ContaExterna("c2", "Corretora", Dinheiro(30000)),
    ]
    provedor.listar_transacoes = lambda conta_id, desde: [
        TransacaoExterna(
            "s" if conta_id == "c1" else "e",
            Dinheiro(30000),
            "Entre minhas contas",
            HOJE - timedelta(days=1) if conta_id == "c1" else HOJE,
            SentidoDaTransacao.SAIDA if conta_id == "c1" else SentidoDaTransacao.ENTRADA,
        )
    ]
    c = cliente_da_importacao
    _sincronizar(c, dono)
    contas = c.get("/contas", headers=dono).json()
    corrente = next(x for x in contas if x["nome"] == "Corrente")
    inv = next(x for x in contas if x["nome"] == "Corretora")
    assert (
        c.put(
            f"/contas/{corrente['id']}/papel", json={"papel": "corrente"}, headers=dono
        ).status_code
        == 200
    )
    assert (
        c.put(
            f"/contas/{inv['id']}/papel", json={"papel": "investimento"}, headers=dono
        ).status_code
        == 200
    )
    caixa = _caixa(c, dono)
    saida = next(t for t in caixa if t["sentido"] == "saida")
    entrada = next(t for t in caixa if t["sentido"] == "entrada")
    resposta = c.post(
        f"/transacoes-importadas/{saida['id']}/aceitar-como-transferencia",
        json={
            "conta_contraparte_id": inv["id"],
            "par_transacao_id": entrada["id"],
        },
        headers=dono,
    )
    assert resposta.status_code == 200
    assert resposta.json()["aporte_liquido"] == "300.00"
    assert resposta.json()["data"] == HOJE.isoformat()
    c.put("/metas/liberdade_financeira", headers=dono, json={"percentual": 25})
    metas = c.get("/metas/progresso", params={"mes": HOJE.strftime("%Y-%m")}, headers=dono).json()
    assert metas["metas"][0]["gasto"] == "0.00"
    url = f"/transacoes-importadas/{entrada['id']}"
    previa = c.get(url + "/impacto-da-reversao", headers=dono).json()
    assert previa["transacoes_reabertas"] == 2
    assert (
        c.post(
            url + "/desfazer-classificacao",
            headers=dono,
            json={"versao_esperada": previa["versao"]},
        ).status_code
        == 200
    )
    assert {t["id"] for t in _caixa(c, dono)} == {saida["id"], entrada["id"]}
    metas = c.get("/metas/progresso", params={"mes": HOJE.strftime("%Y-%m")}, headers=dono).json()
    assert metas["metas"][0]["gasto"] == "0.00"


def test_regressao_liq_bolsa_taxas_e_lazer(cliente_da_importacao, dono, provedor):
    from uuid import UUID

    from gastoba.domain.portas import InvestimentoExterno
    from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy

    provedor.listar_transacoes = lambda conta_id, desde: [
        TransacaoExterna(
            str(i), Dinheiro(valor), texto, date(2026, 11, 4), SentidoDaTransacao.SAIDA
        )
        for i, valor, texto in [
            (1, 278930, "LIQ BOLSA - VISTA BRUTO - PREGÃO: 03/11/2026 - EXEC.: 85 - S 46780"),
            (2, 62, "LIQ BOLSA - VISTA TX CCP/EMOL/TTA B3"),
            (3, 13, "LIQ BOLSA - VISTA TX CCP/EMOL/TTA B3"),
            (4, 7, "LIQ BOLSA - VISTA TX CCP/EMOL/TTA B3"),
            (5, 3200, "Lazer real"),
        ]
    ]
    c = cliente_da_importacao
    _sincronizar(c, dono)
    pessoa = UUID(c.get("/auth/eu", headers=dono).json()["id"])
    with UnidadeDeTrabalhoSqlAlchemy(c.app.state.fabrica_de_sessoes) as u:
        u.investimentos.salvar_posicao(
            pessoa,
            InvestimentoExterno("acao", "Ação fictícia", "EQUITY", None, Dinheiro(278930), "{}"),
        )
        inv = u.investimentos.listar_posicoes(pessoa)[0]
        u.commit()
    caixa = _caixa(c, dono)
    compra = next(t for t in caixa if t["valor"] == "2789.30")
    aceite = c.post(
        f"/transacoes-importadas/{compra['id']}/aceitar",
        headers=dono,
        json={
            "como_investimento": True,
            "investimento_id": str(inv.id),
            "destinacoes": [{"tag": "patrimonio", "percentual": 100}],
        },
    )
    assert aceite.status_code == 201
    for t in caixa:
        if t["valor"] in ("0.62", "0.13", "0.07"):
            r = c.post(
                f"/transacoes-importadas/{t['id']}/aceitar",
                headers=dono,
                json={
                    "como_investimento": True,
                    "tipo_de_movimento": "custo",
                    "investimento_id": str(inv.id),
                    "movimento_relacionado_id": aceite.json()["id"],
                },
            )
            assert r.status_code == 201 and r.json()["tipo"] == "custo"
        elif t["valor"] == "32.00":
            assert (
                c.post(
                    f"/transacoes-importadas/{t['id']}/aceitar",
                    headers=dono,
                    json={"categoria": "lazer"},
                ).status_code
                == 201
            )
    c.put("/metas/lazer", headers=dono, json={"percentual": 19})
    c.put("/metas/liberdade_financeira", headers=dono, json={"percentual": 25})
    metas = c.get("/metas/progresso?mes=2026-11", headers=dono).json()["metas"]
    assert {m["categoria"]: m["gasto"] for m in metas} == {
        "lazer": "32.00",
        "liberdade_financeira": "2789.30",
    }
    posicao = c.get("/investimentos", headers=dono).json()[0]
    # T075: sem dado da instituição e sem operações, não há estimativa pelos aportes.
    assert posicao["valor_aplicado"] is None
    assert posicao["rendimento"] is None


def test_caixinha_concilia_extrato_sem_confundir_saldo_total_da_conta(
    cliente_da_importacao, dono, provedor
):
    provedor.listar_transacoes = lambda conta_id, desde: [
        TransacaoExterna(
            str(i),
            Dinheiro(valor),
            texto,
            date(2026, 11, 4),
            sentido,
            "TRANSFERENCIA_MESMA_INSTITUICAO",
        )
        for i, valor, texto, sentido in [
            (1, 252058, "CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA", SentidoDaTransacao.SAIDA),
            (2, 160000, "CONTA REMUNERADA - RESGATE AUTOMÁTICO", SentidoDaTransacao.ENTRADA),
            (3, 4159, "CONTA REMUNERADA - RENDIMENTO", SentidoDaTransacao.ENTRADA),
        ]
    ]
    c = cliente_da_importacao
    assert _sincronizar(c, dono)["transacoes_novas"] == 3
    conta = c.get("/contas", headers=dono).json()[0]
    inv = c.post(
        "/caixinhas",
        headers=dono,
        json={"conta_id": conta["id"], "saldo_remunerado": "962.17", "data_do_saldo": "2026-11-30"},
    )
    assert inv.status_code == 200 and inv.json()["saldo"] == "962.17"
    assert conta["saldo"] == "1500.00"
    caixa = _caixa(c, dono)
    for valor, tipo in [("2520.58", "aporte"), ("1600.00", "resgate"), ("41.59", "rendimento")]:
        t = next(t for t in caixa if t["valor"] == valor)
        r = c.post(
            f"/transacoes-importadas/{t['id']}/aceitar",
            headers=dono,
            json={
                "como_investimento": True,
                "tipo_de_movimento": tipo,
                "investimento_id": inv.json()["id"],
                "destinacoes": []
                if tipo == "rendimento"
                else [{"tag": "reserva", "percentual": 100}],
            },
        )
        assert r.status_code == 201
    referencia = c.put(
        f"/investimentos/{inv.json()['id']}/referencias-da-caixinha/2026-11",
        headers=dono,
        json={
            "saldo_inicial": "0.00",
            "saldo_final": "962.17",
            "periodo_completo": True,
        },
    )
    assert referencia.status_code == 200
    resultado = c.get(f"/investimentos/{inv.json()['id']}/reconciliacao?mes=2026-11", headers=dono)
    assert resultado.status_code == 200
    assert resultado.json() == {
        "saldo_inicial": "0.00",
        "saldo_observado": "962.17",
        "saldo_calculado": "962.17",
        "diferenca": "0.00",
        "completo": True,
        "conciliado": True,
    }


def test_aceitar_como_transferencia_sem_par_da_422_e_inexistente_da_404(
    cliente_da_importacao, dono
):
    _sincronizar(cliente_da_importacao, dono)
    mercado = _por_id_externo(_caixa(cliente_da_importacao, dono), "Mercado")

    sem_par = cliente_da_importacao.post(
        f"/transacoes-importadas/{mercado['id']}/aceitar-como-transferencia", headers=dono
    )
    inexistente = cliente_da_importacao.post(
        f"/transacoes-importadas/{uuid4()}/aceitar-como-transferencia",
        headers=dono,
        json={"conta_contraparte_id": str(uuid4())},
    )

    assert sem_par.status_code == 422
    assert sem_par.json()["erro"]["codigo"] == "requisicao_invalida"
    assert inexistente.status_code == 404
    assert "par_sugerido_id" in _caixa(cliente_da_importacao, dono)[0]
    assert len(_caixa(cliente_da_importacao, dono)) == 3


def test_ignorar_com_motivo_filtrar_e_restaurar_sem_lancamentos(cliente_da_importacao, dono):
    c = cliente_da_importacao
    _sincronizar(c, dono)
    t = _por_id_externo(_caixa(c, dono), "Mercado")
    saldo_antes = c.get("/contas", headers=dono).json()
    assert (
        c.post(
            f"/transacoes-importadas/{t['id']}/ignorar", headers=dono, json={"motivo": "invalido"}
        ).status_code
        == 422
    )
    assert (
        c.post(
            f"/transacoes-importadas/{t['id']}/ignorar",
            headers=dono,
            json={"motivo": "transferencia_entre_contas"},
        ).status_code
        == 204
    )
    filtradas = _caixa(c, dono, estado="ignorada", motivo="transferencia_entre_contas")
    assert [x["id"] for x in filtradas] == [t["id"]]
    assert filtradas[0]["motivo_ignorada"] == "transferencia_entre_contas"
    assert c.post(f"/transacoes-importadas/{t['id']}/restaurar", headers=dono).status_code == 204
    assert _por_id_externo(_caixa(c, dono), "Mercado")["motivo_ignorada"] is None
    assert _caixa(c, dono, estado="ignorada", motivo="transferencia_entre_contas") == []
    assert c.get("/contas", headers=dono).json() == saldo_antes
    assert (
        c.get("/gastos", headers=dono, params={"inicio": "2000-01-01", "fim": "2999-12-31"}).json()
        == []
    )
    assert (
        c.get("/ganhos", headers=dono, params={"inicio": "2000-01-01", "fim": "2999-12-31"}).json()
        == []
    )
