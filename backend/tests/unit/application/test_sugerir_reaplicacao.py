from datetime import date

from apoio_de_casamentos import OUTRO, USUARIO, _cenario, _transacao, ligar

from gastoba.application.sugerir_reaplicacao import SugerirReaplicacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.operacao import TipoDeOperacao
from gastoba.domain.transacao_importada import SentidoDaTransacao


def preparar(uow, dia=4, valor=14313, confirmar=True):
    conta, operacao = _cenario(uow, "FIXED_INCOME", TipoDeOperacao.VENDA, 14803, 490)
    credito = _transacao(uow, conta, "RESGATE", 14803, 3, SentidoDaTransacao.ENTRADA)
    imposto = _transacao(uow, conta, "IRRF - CDB", 490, 3)
    if confirmar:
        ligar(uow, operacao, [credito, imposto], renda_fixa=True)
    aporte = MovimentoDeInvestimento(
        conta.id, TipoDeMovimento.APORTE, Dinheiro(valor), "Aplicação", date(2026, 11, dia)
    )
    with uow as u:
        u.movimentos_de_investimento.adicionar(aporte)
        u.commit()
    return operacao, aporte


def test_sugere_liquido_sem_aplicar_e_isola_usuario(unidade_de_trabalho):
    operacao, aporte = preparar(unidade_de_trabalho)
    (s,) = SugerirReaplicacao(unidade_de_trabalho).executar(USUARIO)
    assert s.operacao_id == operacao.id and s.aporte_id == aporte.id
    assert s.valor == Dinheiro(14313)
    assert SugerirReaplicacao(unidade_de_trabalho).executar(OUTRO) == []
    with unidade_de_trabalho as u:
        assert u.reaplicacoes_de_resgates.listar(USUARIO) == []


def test_ambiguo_nao_sugere(unidade_de_trabalho):
    _, aporte = preparar(unidade_de_trabalho)
    with unidade_de_trabalho as u:
        u.movimentos_de_investimento.adicionar(
            MovimentoDeInvestimento(
                aporte.conta_id, TipoDeMovimento.APORTE, aporte.valor, "Outra", aporte.data
            )
        )
        u.commit()
    assert SugerirReaplicacao(unidade_de_trabalho).executar(USUARIO) == []


def test_exige_casamento_confirmado(unidade_de_trabalho):
    preparar(unidade_de_trabalho, confirmar=False)
    assert SugerirReaplicacao(unidade_de_trabalho).executar(USUARIO) == []


def test_fora_da_janela_nao_sugere(unidade_de_trabalho):
    preparar(unidade_de_trabalho, dia=6)
    assert SugerirReaplicacao(unidade_de_trabalho).executar(USUARIO) == []


def test_valor_bruto_nao_e_reaplicacao_do_liquido(unidade_de_trabalho):
    preparar(unidade_de_trabalho, valor=14803)
    assert SugerirReaplicacao(unidade_de_trabalho).executar(USUARIO) == []


def test_usa_taxa_casada_quando_corretora_nao_informa_custos(unidade_de_trabalho):
    from apoio_de_casamentos import BRUTO, TAXA

    conta, operacao = _cenario(unidade_de_trabalho, "EQUITY", TipoDeOperacao.VENDA)
    credito = _transacao(unidade_de_trabalho, conta, BRUTO, 278930, 5, SentidoDaTransacao.ENTRADA)
    taxa = _transacao(unidade_de_trabalho, conta, TAXA, 62, 5)
    ligar(unidade_de_trabalho, operacao, [credito, taxa])
    aporte = MovimentoDeInvestimento(
        conta.id, TipoDeMovimento.APORTE, Dinheiro(278868), "Aplicação", date(2026, 11, 6)
    )
    with unidade_de_trabalho as u:
        u.movimentos_de_investimento.adicionar(aporte)
        u.commit()
    (s,) = SugerirReaplicacao(unidade_de_trabalho).executar(USUARIO)
    assert s.valor == Dinheiro(278868)
