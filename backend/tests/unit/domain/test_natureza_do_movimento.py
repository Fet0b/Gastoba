import pytest

from gastoba.domain.excecoes import TransacaoImportadaInvalida
from gastoba.domain.natureza_do_movimento import (
    NaturezaDoMovimento,
    exigir_lancamento_comum,
    natureza_da_descricao,
)

N = NaturezaDoMovimento


@pytest.mark.parametrize(
    ("descricao", "esperada"),
    [
        ("CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA", N.CONTA_REMUNERADA),
        ("Conta remunerada - resgate automático", N.CONTA_REMUNERADA),
        ("IRRF - CDB BANCO GUANABARA S/A 123", N.IMPOSTO_OU_TAXA),
        ("IOF sobre aplicação", N.IMPOSTO_OU_TAXA),
        ("LIQ BOLSA - VISTA TX EMOL", N.IMPOSTO_OU_TAXA),
        ("LIQ BOLSA - VISTA TX CCP", N.IMPOSTO_OU_TAXA),
        ("LIQ BOLSA - VISTA TX TTA B3", N.IMPOSTO_OU_TAXA),
        (
            "LIQ BOLSA - VISTA BRUTO - PREGÃO: 03/11/2026 - EXEC.: 85 - S 46780",
            N.LIQUIDACAO_DE_BOLSA,
        ),
        ("VENCIMENTO - CDB BANCO GUANABARA S/A - Venc.: 2026-10-26 CDB5250LP3Q", N.VENCIMENTO),
        ("RENDIMENTO CONTA REMUNERADA", N.RENDIMENTO),
        ("Remuneração do saldo", N.RENDIMENTO),
        ("Pix enviado para Maria", N.OUTRA),
        ("Transferência irrfuturo", N.OUTRA),
    ],
)
def test_natureza_da_descricao(descricao, esperada):
    assert natureza_da_descricao(descricao) == esperada


def test_liquidacao_bruta_nao_e_lancamento_comum():
    """069 (D6): como as taxas, a liquidação da bolsa só vale como investimento ou ignorada."""
    bruto = "LIQ BOLSA - VISTA BRUTO - PREGÃO: 03/11/2026 - EXEC.: 85 - S 46780"
    with pytest.raises(TransacaoImportadaInvalida, match="Revisão da bolsa"):
        exigir_lancamento_comum(bruto, conta_e_de_investimentos=True)
    with pytest.raises(TransacaoImportadaInvalida):
        exigir_lancamento_comum("LIQ BOLSA - VISTA TX EMOL", conta_e_de_investimentos=True)
    exigir_lancamento_comum("Pix enviado para Maria", conta_e_de_investimentos=True)


@pytest.mark.parametrize(
    "descricao", ["IOF DESPESA NO EXTERIOR", "IRRF - CDB BANCO X 1", "IOF sobre aplicação"]
)
def test_iof_e_irrf_so_sao_imposto_de_investimento_na_conta_investimentos(descricao):
    with pytest.raises(TransacaoImportadaInvalida):
        exigir_lancamento_comum(descricao, conta_e_de_investimentos=True)
    exigir_lancamento_comum(descricao, conta_e_de_investimentos=False)


@pytest.mark.parametrize(
    "descricao",
    [
        "CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA",
        "LIQ BOLSA - VISTA TX EMOL",
        "LIQ BOLSA - VISTA BRUTO - PREGÃO: 03/11/2026 - EXEC.: 85 - S 46780",
        "RENDIMENTO CONTA REMUNERADA",
    ],
)
def test_as_outras_recusas_valem_em_qualquer_conta(descricao):
    with pytest.raises(TransacaoImportadaInvalida):
        exigir_lancamento_comum(descricao, conta_e_de_investimentos=False)


def test_a_sugestao_de_imposto_continua_nas_duas_contas():
    from gastoba.domain.movimento_de_investimento import TipoDeMovimento
    from gastoba.domain.natureza_do_movimento import tipo_sugerido

    assert tipo_sugerido("IOF DESPESA NO EXTERIOR") == TipoDeMovimento.IMPOSTO
