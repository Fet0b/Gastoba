"""Rotas da importação bancária, com um provedor falso no lugar da Pluggy (Art. VI.4)."""

from datetime import date

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


def test_chave_de_leitura_nao_sincroniza_nem_aceita(cliente_da_importacao, dono):
    segredo = cliente_da_importacao.post(
        "/chaves-de-api", json={"nome": "leitura", "escopo": "leitura"}, headers=dono
    ).json()["segredo"]
    chave = {"Authorization": f"Bearer {segredo}"}

    leitura = cliente_da_importacao.get("/transacoes-importadas", headers=chave)
    escrita = cliente_da_importacao.post("/sincronizacoes", headers=chave)

    assert leitura.status_code == 200
    assert escrita.status_code == 403
