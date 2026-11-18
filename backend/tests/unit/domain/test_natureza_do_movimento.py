import pytest

from gastoba.domain.natureza_do_movimento import NaturezaDoMovimento, natureza_da_descricao

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
