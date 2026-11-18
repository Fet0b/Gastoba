from datetime import date
from uuid import UUID

import pytest
from pydantic import SecretStr

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


@pytest.fixture
def cenario(cliente_autenticado):
    c = cliente_autenticado
    pessoa = c.get("/auth/eu").json()
    c.app.state.configuracoes = c.app.state.configuracoes.model_copy(
        update={
            "pluggy_client_id": "teste",
            "pluggy_client_secret": SecretStr("teste"),
            "pluggy_item_ids": ["teste"],
            "pluggy_email_do_dono": pessoa["email"],
        }
    )
    conta = c.post("/contas", json={"nome": "Banco fictício"}).json()
    with UnidadeDeTrabalhoSqlAlchemy(c.app.state.fabrica_de_sessoes) as u:
        u.movimentos_de_investimento.adicionar(
            MovimentoDeInvestimento(
                UUID(conta["id"]),
                TipoDeMovimento.APORTE,
                Dinheiro(278930),
                "LIQ BOLSA fictício",
                date(2026, 11, 4),
                categoria=CategoriaDoGasto.LAZER,
                revisao_contabil_pendente=True,
            )
        )
        u.commit()
    return c, pessoa


def test_relatorio_nao_altera_saldos_nem_expoe_descricoes(cenario):
    c, _ = cenario
    antes = c.get("/contas").json()
    url = "/revisao-contabil?inicio=2026-10-01&fim=2026-12-31"
    resposta = c.get(url)
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert len(corpo["meses"]) == 1
    mes = corpo["meses"][0]
    assert mes["mes"] == "2026-11"
    assert mes["diferenca_liberdade_financeira"] == "-2789.30"
    assert mes["categorias"] == [{"categoria": "lazer", "diferenca": "-2789.30"}]
    assert mes["classificacoes_pendentes"] == 1
    assert "LIQ BOLSA" not in resposta.text
    assert c.get(url).json() == corpo
    assert c.get("/contas").json() == antes
    erro = c.get("/revisao-contabil?inicio=2026-12-01&fim=2026-11-01")
    assert erro.status_code == 422


def test_relatorio_exige_sessao_da_dona_e_isola_outra_pessoa(cenario, autenticar_em):
    c, _ = cenario
    chave = c.post("/chaves-de-api", json={"nome": "Teste de leitura", "escopo": "leitura"}).json()[
        "segredo"
    ]
    url = "/revisao-contabil?inicio=2026-11-01&fim=2026-11-30"
    assert c.get(url, headers={"Authorization": f"Bearer {chave}"}).status_code == 403
    outra = autenticar_em(c, email="outra-diagnostico@x.com", nome="Outra")
    assert c.get(url, headers=outra).status_code == 404
