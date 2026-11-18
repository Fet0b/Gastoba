from gastoba.domain.caixinha import reconciliar_caixinha
from gastoba.domain.dinheiro import Dinheiro


def test_rendimento_e_o_saldo_menos_o_principal():
    r = reconciliar_caixinha(Dinheiro(96217), Dinheiro(92058))
    assert r.rendimento == Dinheiro(4159)
    assert not r.divergente


def test_principal_acima_do_saldo_e_divergencia():
    r = reconciliar_caixinha(Dinheiro(96217), Dinheiro(252058))
    assert r.rendimento.centavos == -155841
    assert r.divergente


def test_saldo_igual_ao_principal_nao_diverge():
    assert not reconciliar_caixinha(Dinheiro(100), Dinheiro(100)).divergente
