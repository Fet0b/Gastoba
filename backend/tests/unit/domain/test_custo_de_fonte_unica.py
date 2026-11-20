from gastoba.domain.custo_medio import custo_de_fonte_unica
from gastoba.domain.dinheiro import Dinheiro


def test_custo_vem_das_despesas_da_operacao_quando_ha():
    assert custo_de_fonte_unica(Dinheiro(82), Dinheiro(82)) == Dinheiro(82)


def test_nunca_soma_as_duas_fontes():
    # expenses 0,82 e débitos de taxa 0,13 + 0,07 + 0,62 = 0,82: o custo é 0,82, não 1,64.
    assert custo_de_fonte_unica(Dinheiro(82), Dinheiro(82)).centavos == 82
    assert custo_de_fonte_unica(Dinheiro(100), Dinheiro(82)) == Dinheiro(100)


def test_sem_despesas_na_operacao_vale_o_dos_debitos_casados():
    assert custo_de_fonte_unica(Dinheiro(0), Dinheiro(82)) == Dinheiro(82)


def test_sem_nenhuma_fonte_o_custo_e_zero():
    assert custo_de_fonte_unica(Dinheiro(0), Dinheiro(0)) == Dinheiro(0)
