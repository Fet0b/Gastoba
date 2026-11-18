"""GET /investimentos expõe ``acao_do_historico`` para a tela escolher o botão do aviso."""

from uuid import UUID

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.portas import InvestimentoExterno
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


def test_posicao_sem_operacoes_pede_completar_o_historico(cliente_autenticado):
    uow = UnidadeDeTrabalhoSqlAlchemy(cliente_autenticado.app.state.fabrica_de_sessoes)
    usuario = UUID(cliente_autenticado.get("/auth/eu").json()["id"])
    with uow as u:
        u.investimentos.salvar_posicao(
            usuario,
            InvestimentoExterno(
                "aupo11", "AUPO11", "EQUITY", None, Dinheiro(369237), '{"quantity": "25"}'
            ),
        )
        u.commit()
    resposta = cliente_autenticado.get("/investimentos")
    assert resposta.status_code == 200
    (investimento,) = resposta.json()
    assert investimento["acao_do_historico"] == "completar"
