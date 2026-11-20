from datetime import date
from uuid import uuid4

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.investimento import Investimento, PontoDoHistorico
from gastoba.domain.sugestao_de_investimento import sugerir_investimento
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

PREGAO = "LIQ BOLSA - VISTA BRUTO - PREGÃO: 03/11/2026 - EXEC.: 85 - S 46780"


def posicao(nome="AUPO11", tipo="EQUITY", **campos):
    base = {
        "id": uuid4(),
        "id_externo": uuid4().hex,
        "nome": nome,
        "tipo": tipo,
        "subtipo": None,
        "saldo": Dinheiro(0),
    }
    base.update(campos)
    return Investimento(**base)


def liquidacao(
    valor=278930, sentido=SentidoDaTransacao.SAIDA, dia=date(2026, 11, 3), descricao=PREGAO
):
    return TransacaoImportada(
        conta_id=uuid4(),
        id_externo=uuid4().hex,
        data=dia,
        descricao=descricao,
        valor=Dinheiro(valor),
        sentido=sentido,
    )


def ponto(p, dia, saldo):
    return PontoDoHistorico(p.id, dia, Dinheiro(saldo))


def test_compra_casa_com_a_acao_que_aparece_logo_apos_a_liquidacao():
    acao, outra = posicao(), posicao("BBAS3")
    historico = [
        ponto(acao, date(2026, 11, 4), 279000),
        ponto(outra, date(2026, 10, 1), 50000),
        ponto(outra, date(2026, 11, 4), 50100),
    ]
    assert sugerir_investimento(liquidacao(), [acao, outra], set(), historico) == acao.id


def test_compra_em_posicao_existente_casa_pela_variacao_do_saldo():
    acao = posicao()
    historico = [ponto(acao, date(2026, 10, 30), 100000), ponto(acao, date(2026, 11, 4), 380000)]
    assert sugerir_investimento(liquidacao(), [acao], set(), historico) == acao.id


def test_venda_casa_com_a_queda_do_saldo():
    acao = posicao("AUVP11")
    historico = [
        ponto(acao, date(2026, 10, 20), 45480),
        ponto(acao, date(2026, 10, 26), 45480),
        ponto(acao, date(2026, 10, 30), 37395),
    ]
    venda = liquidacao(
        valor=8085,
        sentido=SentidoDaTransacao.ENTRADA,
        dia=date(2026, 10, 29),
        descricao="LIQ BOLSA - VISTA BRUTO - PREGÃO: 27/10/2026",
    )
    assert sugerir_investimento(venda, [acao], set(), historico) == acao.id


def test_ambiguo_nao_sugere():
    a, b = posicao("A"), posicao("B")
    historico = [ponto(a, date(2026, 11, 4), 279000), ponto(b, date(2026, 11, 4), 278500)]
    assert sugerir_investimento(liquidacao(), [a, b], set(), historico) is None


def test_valor_distante_ou_sem_historico_nao_sugere():
    acao = posicao()
    assert sugerir_investimento(liquidacao(), [acao], set(), []) is None
    longe = [ponto(acao, date(2026, 11, 4), 500000)]
    assert sugerir_investimento(liquidacao(), [acao], set(), longe) is None


def test_so_acoes_e_fundos_listados_entram():
    cdb = posicao("CDB", tipo="FIXED_INCOME")
    historico = [ponto(cdb, date(2026, 11, 4), 279000)]
    assert sugerir_investimento(liquidacao(), [cdb], set(), historico) is None


def test_aplicacao_automatica_da_conta_nao_sugere_posicao():
    conta = uuid4()
    caixinha = posicao("Conta remunerada", "CAIXINHA", conta_remunerada_id=conta)
    outra = posicao("Conta remunerada", "CAIXINHA", conta_remunerada_id=uuid4())
    transacao = TransacaoImportada(
        conta_id=conta,
        id_externo="x",
        data=date(2026, 11, 5),
        descricao="CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA",
        valor=Dinheiro(95645),
        sentido=SentidoDaTransacao.SAIDA,
    )
    assert sugerir_investimento(transacao, [outra, caixinha], set()) is None
