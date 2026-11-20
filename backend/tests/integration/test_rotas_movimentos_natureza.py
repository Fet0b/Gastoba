"""GET /movimentos-de-investimento devolve a natureza do movimento e o casamento (ainda nulo)."""

from datetime import date
from uuid import UUID

from gastoba.domain.conta import Conta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy

DIA = date(2026, 10, 27)

DESCRICOES = {
    "LIQ BOLSA 27/10": "liquidacao_de_bolsa",
    "TX EMOL BOLSA": "imposto_ou_taxa",
    "APLICACAO AUTOMATICA CONTA INVESTIMENTOS": "conta_remunerada",
    "VENCIMENTO CDB": "vencimento",
    "RENDIMENTO": "rendimento",
    "Aporte qualquer": "outra",
}


def test_traz_a_natureza_e_o_casamento_nulo(cliente_autenticado):
    uow = UnidadeDeTrabalhoSqlAlchemy(cliente_autenticado.app.state.fabrica_de_sessoes)
    usuario = UUID(cliente_autenticado.get("/auth/eu").json()["id"])
    conta = Conta(usuario, "Banco", Dinheiro(0))
    with uow as u:
        u.contas.adicionar(conta)
        for descricao in DESCRICOES:
            u.movimentos_de_investimento.adicionar(
                MovimentoDeInvestimento(
                    conta.id, TipoDeMovimento.APORTE, Dinheiro(1000), descricao, DIA
                )
            )
        u.commit()
    resposta = cliente_autenticado.get(
        "/movimentos-de-investimento", params={"inicio": "2026-10-01", "fim": "2026-10-31"}
    )
    assert resposta.status_code == 200
    por_descricao = {m["descricao"]: m for m in resposta.json()}
    assert set(por_descricao) == set(DESCRICOES)
    for descricao, natureza in DESCRICOES.items():
        assert por_descricao[descricao]["natureza"] == natureza, descricao
        assert por_descricao[descricao]["casamento_id"] is None
