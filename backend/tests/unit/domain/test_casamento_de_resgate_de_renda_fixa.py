from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from gastoba.domain.casamento_de_liquidacao import Tolerancia
from gastoba.domain.casamento_de_operacao import PapelDoVinculo
from gastoba.domain.casamento_de_resgate_de_renda_fixa import (
    montar_casamento_de_renda_fixa,
    sugerir_casamentos_de_renda_fixa,
)
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import OperacaoInvalida
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

CONTA = uuid4()


def _t(descricao, centavos, dia=26, sentido=SentidoDaTransacao.ENTRADA, conta=CONTA):
    return TransacaoImportada(
        conta, f"x{uuid4()}", date(2026, 10, dia), descricao, Dinheiro(centavos), sentido
    )


def _resgate(bruto=14803, irrf=490, dia=26, tipo=TipoDeOperacao.VENDA):
    return Operacao(
        posicao_id=uuid4(),
        tipo=tipo,
        data=date(2026, 10, dia),
        quantidade=Decimal("1"),
        valor_bruto=Dinheiro(bruto),
        custos=Dinheiro(irrf),
        origem=OrigemDaOperacao.PLUGGY,
        id_externo=f"s{uuid4()}",
    )


def _irrf(centavos=490, dia=26):
    return _t("IRRF - CDB BANCO GUANABARA", centavos, dia, SentidoDaTransacao.SAIDA)


def test_credito_dividido_soma_o_bruto_e_o_irrf_acompanha():
    # Caso real: R$ 120,00 (principal) + R$ 28,03 (rendimento) = R$ 148,03; IRRF R$ 4,90.
    operacao = _resgate()
    principal, rendimento, imposto = _t("RESGATE", 12000), _t("RENDIMENTO", 2803), _irrf()
    (sugestao,) = sugerir_casamentos_de_renda_fixa(
        [operacao], [principal, rendimento, imposto, _t("PIX RECEBIDO", 2000)], Tolerancia()
    )
    assert set(sugestao.creditos) == {principal, rendimento}
    assert sugestao.debito_do_imposto == imposto


def test_nunca_casa_pelo_liquido():
    operacao = _resgate()
    liquido = _t("CREDITO", 14313)
    assert sugerir_casamentos_de_renda_fixa([operacao], [liquido, _irrf()], Tolerancia()) == []


def test_um_unico_credito_do_valor_bruto_tambem_casa():
    operacao = _resgate()
    credito = _t("RESGATE CDB", 14803)
    (sugestao,) = sugerir_casamentos_de_renda_fixa([operacao], [credito], Tolerancia())
    assert sugestao.creditos == (credito,)
    assert sugestao.debito_do_imposto is None


def test_vencimento_tambem_e_resgate():
    operacao = _resgate(tipo=TipoDeOperacao.VENCIMENTO)
    assert sugerir_casamentos_de_renda_fixa([operacao], [_t("VENC", 14803)], Tolerancia())


def test_duas_combinacoes_possiveis_nao_casam_sozinhas():
    operacao = _resgate(bruto=10000)
    entradas = [_t("A", 4000), _t("B", 6000), _t("C", 5000), _t("D", 5000)]
    assert sugerir_casamentos_de_renda_fixa([operacao], entradas, Tolerancia()) == []


def test_data_fora_da_janela_ou_outra_conta_nao_casa():
    operacao = _resgate()
    assert sugerir_casamentos_de_renda_fixa([operacao], [_t("X", 14803, dia=1)], Tolerancia()) == []
    metade = [_t("A", 12000), _t("B", 2803, conta=uuid4())]
    assert sugerir_casamentos_de_renda_fixa([operacao], metade, Tolerancia()) == []


def test_irrf_de_valor_diferente_ou_duplicado_nao_acompanha():
    operacao = _resgate()
    credito = _t("RESGATE", 14803)
    (a,) = sugerir_casamentos_de_renda_fixa([operacao], [credito, _irrf(489)], Tolerancia())
    assert a.debito_do_imposto is None
    (b,) = sugerir_casamentos_de_renda_fixa([operacao], [credito, _irrf(), _irrf()], Tolerancia())
    assert b.debito_do_imposto is None


def test_um_credito_para_duas_operacoes_nao_casa_com_nenhuma():
    credito = _t("RESGATE", 14803)
    assert (
        sugerir_casamentos_de_renda_fixa([_resgate(), _resgate(dia=27)], [credito], Tolerancia())
        == []
    )


def test_montar_exige_que_os_creditos_somem_o_bruto():
    operacao = _resgate()
    casamento = montar_casamento_de_renda_fixa(
        operacao, [_t("A", 12000), _t("B", 2803)], _irrf(), Tolerancia()
    )
    assert sorted(v.papel for v in casamento.vinculos) == [
        PapelDoVinculo.BRUTO,
        PapelDoVinculo.BRUTO,
        PapelDoVinculo.IMPOSTO,
    ]
    with pytest.raises(OperacaoInvalida):
        montar_casamento_de_renda_fixa(operacao, [_t("A", 12000)], None, Tolerancia())


def test_montar_recusa_imposto_diferente_do_irrf_da_operacao():
    with pytest.raises(OperacaoInvalida):
        montar_casamento_de_renda_fixa(_resgate(), [_t("A", 14803)], _irrf(489), Tolerancia())
