from datetime import date
from uuid import uuid4

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.investimento import Investimento
from gastoba.domain.sugestao_de_investimento import normalizar_texto, sugerir_investimento
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)

APLICADO = Dinheiro(100000)
EMISSAO = "EMISSAO - CDB BANCO BTG PACTUAL S.A. - Venc: 01/10/2028"


def posicao(nome="CDB Banco BTG Pactual S.A.", valor_aplicado=APLICADO, **campos):
    base = {
        "id": uuid4(),
        "id_externo": uuid4().hex,
        "nome": nome,
        "tipo": "FIXED_INCOME",
        "subtipo": "CDB",
        "saldo": Dinheiro(100500),
        "valor_aplicado": valor_aplicado,
    }
    base.update(campos)
    return Investimento(**base)


def transacao(descricao=EMISSAO, valor=APLICADO, sentido=SentidoDaTransacao.SAIDA):
    return TransacaoImportada(
        conta_id=uuid4(),
        id_externo=uuid4().hex,
        data=date(2026, 10, 1),
        descricao=descricao,
        valor=valor,
        sentido=sentido,
    )


def test_normaliza_minusculas_sem_acento_nem_pontuacao():
    assert normalizar_texto("  Aplicação - CDB  Banco S.A.!  ") == "aplicacao cdb banco s a"


def test_sugere_a_unica_posicao_que_casa_por_nome_e_valor_aplicado():
    cdb = posicao()
    outra = posicao(nome="LCI Itaú", valor_aplicado=Dinheiro(100000))

    assert sugerir_investimento(transacao(), [outra, cdb], set()) == cdb.id


def test_nome_com_acento_e_pontuacao_diferentes_ainda_casa():
    cdb = posicao(nome="Tesouro Selic 2029")
    descricao = "APLICAÇÃO: TESOURO-SELIC 2029 (título)"

    assert sugerir_investimento(transacao(descricao), [cdb], set()) == cdb.id


def test_nome_so_casa_com_palavras_inteiras():
    cdb = posicao(nome="CDB BTG")

    assert sugerir_investimento(transacao("EMISSAO CDB BTGX"), [cdb], set()) is None


def test_valor_diferente_nao_sugere():
    cdb = posicao(valor_aplicado=Dinheiro(99999))

    assert sugerir_investimento(transacao(), [cdb], set()) is None


def test_duas_posicoes_iguais_nao_sugere():
    assert sugerir_investimento(transacao(), [posicao(), posicao()], set()) is None


def test_posicao_sem_valor_aplicado_nao_sugere():
    assert sugerir_investimento(transacao(), [posicao(valor_aplicado=None)], set()) is None


def test_posicao_que_ja_tem_movimento_nao_sugere():
    cdb = posicao()

    assert sugerir_investimento(transacao(), [cdb], {cdb.id}) is None


def test_posicao_com_movimento_sai_da_disputa_e_a_outra_e_sugerida():
    ja_associada = posicao()
    livre = posicao()

    assert sugerir_investimento(transacao(), [ja_associada, livre], {ja_associada.id}) == livre.id


def test_entrada_nao_sugere():
    entrada = transacao(sentido=SentidoDaTransacao.ENTRADA)

    assert sugerir_investimento(entrada, [posicao()], set()) is None


def test_transacao_ja_tratada_nao_sugere():
    aceita = transacao()
    aceita.estado = EstadoDaTransacaoImportada.ACEITA

    assert sugerir_investimento(aceita, [posicao()], set()) is None


def test_nome_que_normaliza_para_vazio_nao_sugere():
    assert sugerir_investimento(transacao(), [posicao(nome=" - ")], set()) is None
