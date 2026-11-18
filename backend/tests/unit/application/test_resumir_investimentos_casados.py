from datetime import date
from uuid import uuid4

from test_confirmar_propostas_da_bolsa import BRUTO, PESSOA, _conta, _operacao, _posicao, _transacao

from gastoba.application.confirmar_propostas_da_bolsa import (
    ConfirmarPropostasDaBolsa,
    ItemDeConfirmacao,
)
from gastoba.application.listar_resgates_sem_destinacao import ListarResgatesSemDestinacao
from gastoba.application.listar_revisao_da_bolsa import ListarRevisaoDaBolsa
from gastoba.application.resumir_investimentos import ResumirInvestimentos, VisaoDosInvestimentos
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.operacao import TipoDeOperacao
from gastoba.domain.transacao_importada import SentidoDaTransacao


def _ligar(uow):
    (p,) = ListarRevisaoDaBolsa(uow).executar(PESSOA).propostas
    ConfirmarPropostasDaBolsa(uow).executar(PESSOA, [ItemDeConfirmacao(p.proposta.chave, p.versao)])


def test_aporte_de_transacao_casada_nao_entra_em_aportes_sem_destino(unidade_de_trabalho):
    uow = unidade_de_trabalho
    conta = _conta(uow)
    posicao = _posicao(uow)
    _operacao(uow, posicao, 1000)
    _transacao(uow, conta, BRUTO, 1000, "b")
    _ligar(uow)
    # Um aporte comum, não casado, continua contando.
    with uow as u:
        u.movimentos_de_investimento.adicionar(
            MovimentoDeInvestimento(
                conta.id, TipoDeMovimento.APORTE, Dinheiro(700), "Aporte", date(2026, 11, 1)
            )
        )
        u.commit()
    resumo = ResumirInvestimentos(uow).executar(PESSOA, VisaoDosInvestimentos.DESTINACAO)
    assert resumo.aportes_sem_destino_quantidade == 1
    assert resumo.aportes_sem_destino_total == Dinheiro(700)


def test_resgate_de_transacao_casada_nao_vira_aviso(unidade_de_trabalho):
    uow = unidade_de_trabalho
    conta = _conta(uow)
    posicao = _posicao(uow)
    _operacao(uow, posicao, 5000, tipo=TipoDeOperacao.VENDA)
    _transacao(uow, conta, BRUTO, 5000, "b", sentido=SentidoDaTransacao.ENTRADA)
    _ligar(uow)
    assert len(uow.confirmado.movimentos_de_investimento) == 1
    assert ListarResgatesSemDestinacao(uow).executar(PESSOA) == []
    assert ListarResgatesSemDestinacao(uow).executar(uuid4()) == []
