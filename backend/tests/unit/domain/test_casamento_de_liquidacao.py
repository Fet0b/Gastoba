from datetime import date
from decimal import Decimal
from uuid import uuid4

from gastoba.domain.casamento_de_liquidacao import (
    Tolerancia,
    data_do_pregao,
    e_liquidacao_bruta,
    e_taxa_de_liquidacao,
    sugerir_casamentos_de_bolsa,
)
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

CONTA = uuid4()
BRUTO = "LIQ BOLSA - VISTA BRUTO - PREGÃO: 03/11/2026 - EXEC.: 85 - S 46780"
TAXA = "LIQ BOLSA - VISTA TX CCP/EMOL/TTA B3"


def _transacao(descricao, centavos, dia=5, sentido=SentidoDaTransacao.SAIDA, conta=CONTA):
    return TransacaoImportada(
        conta, f"x{uuid4()}", date(2026, 11, dia), descricao, Dinheiro(centavos), sentido
    )


def _operacao(tipo=TipoDeOperacao.COMPRA, centavos=278930, dia=3):
    return Operacao(
        posicao_id=uuid4(),
        tipo=tipo,
        data=date(2026, 11, dia),
        quantidade=Decimal("25"),
        valor_bruto=Dinheiro(centavos),
        origem=OrigemDaOperacao.PLUGGY,
        id_externo=f"op{uuid4()}",
    )


def test_le_a_data_do_pregao_da_descricao():
    assert data_do_pregao(BRUTO) == date(2026, 11, 3)
    assert data_do_pregao("LIQ BOLSA - VISTA BRUTO") is None
    assert data_do_pregao("PREGAO: 31/02/2026") is None  # data impossível


def test_reconhece_o_debito_bruto_e_as_taxas():
    assert e_liquidacao_bruta(BRUTO)
    assert not e_liquidacao_bruta(TAXA)
    assert e_taxa_de_liquidacao(TAXA)
    assert e_taxa_de_liquidacao("LIQ BOLSA - VISTA TX EMOL")
    assert not e_taxa_de_liquidacao(BRUTO)
    assert not e_taxa_de_liquidacao("IRRF - CDB BANCO")


def test_um_candidato_sugere_com_as_taxas_do_mesmo_dia():
    operacao = _operacao()
    bruto = _transacao(BRUTO, 278930)
    taxas = [_transacao(TAXA, 62), _transacao(TAXA, 13), _transacao(TAXA, 7)]
    (sugestao,) = sugerir_casamentos_de_bolsa([operacao], [bruto, *taxas], Tolerancia())
    assert sugestao.operacao == operacao
    assert sugestao.bruto == bruto
    assert set(sugestao.taxas) == set(taxas)


def test_taxas_de_outro_dia_ou_outra_conta_nao_entram():
    operacao = _operacao()
    bruto = _transacao(BRUTO, 278930)
    longe = _transacao(TAXA, 62, dia=9)
    outra_conta = _transacao(TAXA, 13, conta=uuid4())
    (sugestao,) = sugerir_casamentos_de_bolsa([operacao], [bruto, longe, outra_conta], Tolerancia())
    assert sugestao.taxas == ()


def test_tolerancia_padrao_aceita_o_pregao_ate_d_mais_2():
    bruto = _transacao(BRUTO, 278930)  # pregão em 03/11
    for dia in (1, 2, 3, 4, 5):  # operações de 01 a 05/11: diferença de até 2 dias
        assert sugerir_casamentos_de_bolsa([_operacao(dia=dia)], [bruto], Tolerancia())
    assert not sugerir_casamentos_de_bolsa([_operacao(dia=6)], [bruto], Tolerancia())


def test_valor_diferente_ou_pregao_alem_da_janela_nao_sugere():
    bruto = _transacao(BRUTO, 278930)
    assert sugerir_casamentos_de_bolsa([_operacao(centavos=278931)], [bruto], Tolerancia()) == []
    assert sugerir_casamentos_de_bolsa([_operacao(dia=10)], [bruto], Tolerancia()) == []


def test_tolerancia_e_configuravel():
    bruto = _transacao(BRUTO, 278930)
    assert sugerir_casamentos_de_bolsa(
        [_operacao(centavos=278931)], [bruto], Tolerancia(dias=2, centavos=1)
    )
    assert sugerir_casamentos_de_bolsa([_operacao(dia=10)], [bruto], Tolerancia(dias=7))


def test_zero_ou_varios_candidatos_nao_casam_sozinhos():
    operacao = _operacao()
    assert sugerir_casamentos_de_bolsa([operacao], [], Tolerancia()) == []
    dois = [_transacao(BRUTO, 278930), _transacao(BRUTO, 278930)]
    assert sugerir_casamentos_de_bolsa([operacao], dois, Tolerancia()) == []


def test_um_debito_que_serve_a_duas_operacoes_nao_casa_com_nenhuma():
    bruto = _transacao(BRUTO, 278930)
    assert sugerir_casamentos_de_bolsa([_operacao(), _operacao(dia=4)], [bruto], Tolerancia()) == []


def test_venda_casa_com_a_entrada_no_mesmo_formato():
    venda = _operacao(TipoDeOperacao.VENDA, 100000)
    entrada = _transacao(BRUTO, 100000, sentido=SentidoDaTransacao.ENTRADA)
    saida = _transacao(BRUTO, 100000)
    (sugestao,) = sugerir_casamentos_de_bolsa([venda], [saida, entrada], Tolerancia())
    assert sugestao.bruto == entrada


def test_compra_nao_casa_com_entrada():
    entrada = _transacao(BRUTO, 278930, sentido=SentidoDaTransacao.ENTRADA)
    assert sugerir_casamentos_de_bolsa([_operacao()], [entrada], Tolerancia()) == []


def test_montar_casamento_de_bolsa_com_bruto_e_taxas():
    from gastoba.domain.casamento_de_liquidacao import montar_casamento_de_bolsa
    from gastoba.domain.casamento_de_operacao import PapelDoVinculo

    operacao = _operacao()
    bruto = _transacao(BRUTO, 278930)
    taxas = [_transacao(TAXA, 62), _transacao(TAXA, 13)]
    casamento = montar_casamento_de_bolsa([operacao], [bruto, *taxas], Tolerancia())
    papeis = sorted(v.papel for v in casamento.vinculos)
    assert papeis == [PapelDoVinculo.BRUTO, PapelDoVinculo.TAXA, PapelDoVinculo.TAXA]


def test_montar_casamento_de_bolsa_recusa_sem_bruto_ou_com_dois():
    import pytest

    from gastoba.domain.casamento_de_liquidacao import montar_casamento_de_bolsa
    from gastoba.domain.excecoes import CasamentoAmbiguo, OperacaoInvalida

    operacao = _operacao()
    with pytest.raises(OperacaoInvalida):
        montar_casamento_de_bolsa([operacao], [_transacao(TAXA, 62)], Tolerancia())
    dois = [_transacao(BRUTO, 278930), _transacao(BRUTO, 278930)]
    with pytest.raises(CasamentoAmbiguo):
        montar_casamento_de_bolsa([operacao], dois, Tolerancia())


def test_casamento_guarda_varias_operacoes_sem_repeticao():
    import pytest

    from gastoba.domain.casamento_de_operacao import (
        CasamentoDeOperacao,
        PapelDoVinculo,
        VinculoDeCasamento,
    )
    from gastoba.domain.excecoes import OperacaoInvalida

    a, b = uuid4(), uuid4()
    vinculo = (VinculoDeCasamento(uuid4(), PapelDoVinculo.BRUTO),)
    assert CasamentoDeOperacao((a, b), vinculo).operacao_ids == (a, b)
    with pytest.raises(OperacaoInvalida):
        CasamentoDeOperacao((), vinculo)
    with pytest.raises(OperacaoInvalida):
        CasamentoDeOperacao((a, a), vinculo)


def test_montar_casamento_de_bolsa_com_varias_operacoes_soma_o_bruto():
    from gastoba.domain.casamento_de_liquidacao import montar_casamento_de_bolsa

    a, b = _operacao(centavos=100000), _operacao(centavos=178930)
    casamento = montar_casamento_de_bolsa([a, b], [_transacao(BRUTO, 278930)], Tolerancia())
    assert set(casamento.operacao_ids) == {a.id, b.id}


def test_montar_casamento_de_bolsa_recusa_soma_data_ou_sentido_incompativeis():
    import pytest

    from gastoba.domain.casamento_de_liquidacao import montar_casamento_de_bolsa
    from gastoba.domain.excecoes import OperacaoInvalida

    a, b = _operacao(centavos=100000), _operacao(centavos=178930)
    with pytest.raises(OperacaoInvalida):  # soma diferente do bruto
        montar_casamento_de_bolsa([a, b], [_transacao(BRUTO, 278931)], Tolerancia())
    outra_data = _operacao(centavos=178930, dia=4)
    with pytest.raises(OperacaoInvalida):  # datas diferentes
        montar_casamento_de_bolsa([a, outra_data], [_transacao(BRUTO, 278930)], Tolerancia())
    venda = _operacao(tipo=TipoDeOperacao.VENDA, centavos=178930)
    with pytest.raises(OperacaoInvalida):  # compra e venda misturadas
        montar_casamento_de_bolsa([a, venda], [_transacao(BRUTO, 278930)], Tolerancia())
    with pytest.raises(OperacaoInvalida):  # nenhuma operação
        montar_casamento_de_bolsa([], [_transacao(BRUTO, 278930)], Tolerancia())
