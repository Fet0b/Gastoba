from gastoba.domain.destinacao import ratear_saldo
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.pesos_da_caixinha import pesos_da_caixinha, ratear_pelos_pesos
from gastoba.domain.tag import Tag

RESERVA, VIAGEM, CARRO = Tag("reserva"), Tag("viagem"), Tag("carro")


def test_pesos_sao_os_principais_em_centavos_sem_os_zerados():
    pesos = pesos_da_caixinha(
        {RESERVA: Dinheiro(60000), VIAGEM: Dinheiro(40000), CARRO: Dinheiro(0)}
    )
    assert pesos == {RESERVA: 60000, VIAGEM: 40000}


def test_rateio_pelos_pesos_e_igual_ao_atual_com_zero_centavo_de_diferenca():
    principais = {RESERVA: Dinheiro(33333), VIAGEM: Dinheiro(33333), CARRO: Dinheiro(33334)}
    for saldo in (100000, 100001, 123457, 1):
        atual = ratear_saldo(Dinheiro(saldo), principais)
        novo = ratear_pelos_pesos(Dinheiro(saldo), pesos_da_caixinha(principais), Dinheiro(0))
        assert novo == atual
        assert sum(v.centavos for _, v in novo) == saldo


def test_compra_nova_fica_sem_caixinha_e_nao_muda_as_fracoes():
    pesos = {RESERVA: 60000, VIAGEM: 40000}
    antes = ratear_pelos_pesos(Dinheiro(100000), pesos, Dinheiro(0))
    depois = ratear_pelos_pesos(Dinheiro(110000), pesos, Dinheiro(10000))
    assert [(t, v) for t, v in depois if t is not None] == antes
    assert (None, Dinheiro(10000)) in depois
    assert sum(v.centavos for _, v in depois) == 110000


def test_sem_pesos_todo_o_saldo_fica_sem_caixinha():
    assert ratear_pelos_pesos(Dinheiro(5000), {}, Dinheiro(0)) == [(None, Dinheiro(5000))]
    assert ratear_pelos_pesos(Dinheiro(0), {}, Dinheiro(0)) == []


def test_parte_sem_caixinha_nunca_passa_do_saldo():
    depois = ratear_pelos_pesos(Dinheiro(1000), {RESERVA: 1}, Dinheiro(5000))
    assert sum(v.centavos for _, v in depois) == 1000
    assert (None, Dinheiro(1000)) in depois
