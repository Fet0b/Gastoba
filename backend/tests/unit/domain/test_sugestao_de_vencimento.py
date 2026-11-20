from datetime import date
from uuid import uuid4

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.investimento import Investimento
from gastoba.domain.sugestao_de_investimento import sugerir_investimento
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

VENCIMENTO = "VENCIMENTO - CDB BANCO GUANABARA S/A - Venc.: 2026-10-26 CDB5250LP3Q"


def posicao(**campos):
    base = {
        "id": uuid4(),
        "id_externo": uuid4().hex,
        "nome": "CDB - BANCO GUANABARA S/A",
        "tipo": "FIXED_INCOME",
        "subtipo": "CDB",
        "saldo": Dinheiro(0),
        "emissor": "BANCO GUANABARA S/A",
        "vencimento": date(2026, 10, 26),
    }
    base.update(campos)
    return Investimento(**base)


def entrada(descricao=VENCIMENTO):
    return TransacaoImportada(
        conta_id=uuid4(),
        id_externo=uuid4().hex,
        data=date(2026, 10, 26),
        descricao=descricao,
        valor=Dinheiro(12000),
        sentido=SentidoDaTransacao.ENTRADA,
    )


def test_vencimento_casa_pelo_emissor_e_pela_data():
    certo = posicao()
    outro_prazo = posicao(vencimento=date(2027, 1, 10))
    outro_emissor = posicao(emissor="BANCO INTER", nome="CDB - BANCO INTER")
    assert sugerir_investimento(entrada(), [outro_prazo, certo, outro_emissor], set()) == certo.id


def test_vencimento_casa_pelo_codigo_quando_o_emissor_repete_a_data():
    a = posicao(codigo="CDB5250LP3Q")
    b = posicao(codigo="CDB9999XXXX")
    assert sugerir_investimento(entrada(), [a, b], set()) == a.id


def test_vencimento_ambiguo_nao_sugere():
    assert sugerir_investimento(entrada(), [posicao(), posicao()], set()) is None


def test_vencimento_sem_data_igual_nao_sugere():
    assert sugerir_investimento(entrada(), [posicao(vencimento=date(2027, 1, 1))], set()) is None


def test_entrada_que_nao_e_vencimento_nao_sugere():
    assert sugerir_investimento(entrada("PIX RECEBIDO"), [posicao()], set()) is None


def test_investimento_com_movimento_ainda_pode_receber_o_vencimento():
    p = posicao()
    assert sugerir_investimento(entrada(), [p], {p.id}) == p.id
