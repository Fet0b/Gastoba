import json
from datetime import date
from decimal import Decimal
from uuid import uuid4

from gastoba.application.listar_investimentos import ListarInvestimentos
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.portas import InvestimentoExterno

USUARIO = uuid4()
HOJE = date(2026, 11, 10)


def _investimento(uow, tipo="EQUITY", dados=None):
    dados = json.dumps(dados if dados is not None else {"quantity": "25"})
    with uow as u:
        u.investimentos.salvar_posicao(
            USUARIO, InvestimentoExterno("aupo11", "AUPO11", tipo, None, Dinheiro(369237), dados)
        )
        u.commit()
    with uow as u:
        return next(i for i in u.investimentos.listar_posicoes(USUARIO))


def _operacao(uow, investimento, **mudancas):
    base = dict(
        posicao_id=investimento.id,
        tipo=TipoDeOperacao.COMPRA,
        data=date(2026, 11, 3),
        quantidade=Decimal("25"),
        valor_bruto=Dinheiro(278930),
        origem=OrigemDaOperacao.MANUAL,
    )
    base.update(mudancas)
    with uow as u:
        u.operacoes.adicionar(USUARIO, Operacao(**base))
        u.commit()


def _acao(uow):
    (posicao,) = ListarInvestimentos(uow).executar(USUARIO, hoje=HOJE)
    return posicao.acao_do_historico


def test_operacao_da_corretora_com_quantidade_estimada_pede_confirmar(unidade_de_trabalho):
    investimento = _investimento(unidade_de_trabalho)
    _operacao(
        unidade_de_trabalho,
        investimento,
        origem=OrigemDaOperacao.PLUGGY,
        id_externo="op-1",
        quantidade_estimada=True,
    )
    assert _acao(unidade_de_trabalho) == "confirmar_quantidade"


def test_faltam_cotas_sem_estimada_pede_completar(unidade_de_trabalho):
    _investimento(unidade_de_trabalho)
    assert _acao(unidade_de_trabalho) == "completar"


def test_sobram_cotas_pede_conferir_as_operacoes(unidade_de_trabalho):
    investimento = _investimento(unidade_de_trabalho, dados={"quantity": "10"})
    _operacao(unidade_de_trabalho, investimento)
    assert _acao(unidade_de_trabalho) == "conferir_operacoes"


def test_possivel_duplicidade_pede_conferir_as_operacoes(unidade_de_trabalho):
    pendencia = {"tipo": "compra", "data": "2026-11-03", "motivo": "possivel_duplicidade"}
    _investimento(
        unidade_de_trabalho,
        dados={"quantity": "25", "gastoba_pendencias_de_operacoes": [pendencia]},
    )
    assert _acao(unidade_de_trabalho) == "conferir_operacoes"


def test_historico_completo_nao_tem_acao(unidade_de_trabalho):
    investimento = _investimento(unidade_de_trabalho)
    _operacao(unidade_de_trabalho, investimento)
    assert _acao(unidade_de_trabalho) is None


def test_caixinha_nao_tem_acao(unidade_de_trabalho):
    _investimento(unidade_de_trabalho, tipo="CAIXINHA")
    assert _acao(unidade_de_trabalho) is None
