import pytest

from gastoba.domain.destinacao import (
    Destinacao,
    dividir_por_percentuais,
    principal_abatido,
    ratear_saldo,
    validar_destinacoes,
)
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import DestinacaoInvalida
from gastoba.domain.tag import Tag


def d(tag, percentual):
    return Destinacao(Tag.de_texto(tag), percentual)


@pytest.mark.parametrize("percentual", [0, -5, 101, True])
def test_percentual_precisa_ser_inteiro_de_1_a_100(percentual):
    with pytest.raises(DestinacaoInvalida):
        d("casa", percentual)


def test_validar_exige_soma_100_sem_tag_repetida_e_lista_nao_vazia():
    validar_destinacoes([d("casa", 60), d("viagem", 40)])
    for invalida in ([], [d("casa", 50)], [d("casa", 60), d("casa", 40)], [d("a", 60), d("b", 60)]):
        with pytest.raises(DestinacaoInvalida):
            validar_destinacoes(invalida)


def test_dividir_soma_exatamente_o_valor_e_o_resto_vai_para_a_primeira():
    partes = dividir_por_percentuais(Dinheiro(10001), [d("a", 33), d("b", 33), d("c", 34)])

    assert [(str(t), v.centavos) for t, v in partes] == [("a", 3301), ("b", 3300), ("c", 3400)]
    assert sum(v.centavos for _, v in partes) == 10001


def test_dividir_valor_pequeno_nao_perde_centavo():
    partes = dividir_por_percentuais(Dinheiro(1), [d("a", 50), d("b", 50)])
    assert [v.centavos for _, v in partes] == [1, 0]


def test_ratear_saldo_proporcional_ao_principal_e_soma_o_saldo():
    principais = {Tag.de_texto("casa"): Dinheiro(30000), Tag.de_texto("viagem"): Dinheiro(10000)}

    fatias = ratear_saldo(Dinheiro(41001), principais)

    assert [(str(t), v.centavos) for t, v in fatias] == [("casa", 30751), ("viagem", 10250)]
    assert sum(v.centavos for _, v in fatias) == 41001


def test_ratear_saldo_sem_principal_vai_para_sem_destinacao():
    assert ratear_saldo(Dinheiro(500), {}) == [(None, Dinheiro(500))]
    assert ratear_saldo(Dinheiro(500), {Tag.de_texto("a"): Dinheiro(0)}) == [(None, Dinheiro(500))]


def test_ratear_saldo_zero_nao_gera_fatias_de_valor_zero_para_sem_destinacao():
    assert ratear_saldo(Dinheiro(0), {}) == []


def test_ratear_saldo_com_parte_sem_caixinha_do_exemplo_do_dono():
    # LCI de R$ 12.500: R$ 1.800 na Reserva, R$ 1.000 na Viagem e R$ 9.200 sem caixinha.
    principais = {
        Tag.de_texto("reserva"): Dinheiro(180000),
        Tag.de_texto("viagem"): Dinheiro(100000),
    }

    fatias = ratear_saldo(Dinheiro(1250000), principais, Dinheiro(920000))

    assert [(None if t is None else str(t), v.centavos) for t, v in fatias] == [
        (None, 958334),
        ("reserva", 187500),
        ("viagem", 104166),
    ]
    assert sum(v.centavos for _, v in fatias) == 1250000


def test_ratear_saldo_sem_parte_sem_caixinha_e_identico_ao_de_antes():
    principais = {Tag.de_texto("casa"): Dinheiro(30000), Tag.de_texto("viagem"): Dinheiro(10000)}
    for saldo in (0, 1, 41001, 40000, 39000):
        assert ratear_saldo(Dinheiro(saldo), principais, Dinheiro(0)) == ratear_saldo(
            Dinheiro(saldo), principais
        )


def test_ratear_saldo_com_prejuizo_mostra_rendimento_negativo_proporcional():
    principais = {Tag.de_texto("a"): Dinheiro(1000)}

    fatias = ratear_saldo(Dinheiro(1800), principais, Dinheiro(1000))

    assert [(None if t is None else str(t), v.centavos) for t, v in fatias] == [
        ("a", 900),
        (None, 900),
    ]


def test_ratear_saldo_empate_deixa_sem_caixinha_por_ultimo():
    principais = {Tag.de_texto("a"): Dinheiro(100)}

    fatias = ratear_saldo(Dinheiro(200), principais, Dinheiro(100))

    assert [(None if t is None else str(t), v.centavos) for t, v in fatias] == [
        ("a", 100),
        (None, 100),
    ]


def test_ratear_saldo_so_com_parte_sem_caixinha_fica_tudo_sem_caixinha():
    assert ratear_saldo(Dinheiro(500), {}, Dinheiro(300)) == [(None, Dinheiro(500))]


def test_principal_abatido_proporcional_a_parte_resgatada():
    assert principal_abatido(Dinheiro(1000), Dinheiro(550), Dinheiro(1100)) == Dinheiro(500)


def test_principal_abatido_resgate_total_devolve_o_principal_inteiro():
    assert principal_abatido(Dinheiro(1000), Dinheiro(1100), Dinheiro(1100)) == Dinheiro(1000)


def test_principal_abatido_parte_maior_que_o_valor_nao_passa_do_principal():
    assert principal_abatido(Dinheiro(1000), Dinheiro(2000), Dinheiro(1100)) == Dinheiro(1000)


@pytest.mark.parametrize("valor_da_tag", [0, -100])
def test_principal_abatido_sem_valor_da_tag_positivo_levanta(valor_da_tag):
    with pytest.raises(DestinacaoInvalida):
        principal_abatido(Dinheiro(1000), Dinheiro(100), Dinheiro(valor_da_tag))


def test_principal_abatido_trunca_em_centavos_inteiros():
    assert principal_abatido(Dinheiro(100), Dinheiro(1), Dinheiro(3)) == Dinheiro(33)


def test_principal_abatido_nunca_passa_do_principal():
    for parte in range(0, 25):
        assert principal_abatido(Dinheiro(777), Dinheiro(parte), Dinheiro(20)).centavos <= 777


def test_abater_das_partes_na_proporcao_e_sem_perder_centavo():
    from gastoba.domain.destinacao import abater_das_partes

    partes = [(Tag.de_texto("a"), Dinheiro(167355)), (Tag.de_texto("b"), Dinheiro(111570))]
    sobra = abater_das_partes(partes, Dinheiro(100000))
    assert sum(v.centavos for _, v in sobra) == 178925
    assert [t.valor for t, _ in sobra] == ["a", "b"]


def test_abater_das_partes_total_ou_mais_nao_deixa_nada():
    from gastoba.domain.destinacao import abater_das_partes

    partes = [(Tag.de_texto("a"), Dinheiro(100))]
    assert abater_das_partes(partes, Dinheiro(100)) == []
    assert abater_das_partes(partes, Dinheiro(500)) == []


def test_destinacoes_proporcionais_somam_100_e_seguem_o_principal():
    from gastoba.domain.destinacao import destinacoes_proporcionais

    principais = {
        Tag.de_texto("a"): Dinheiro(10000),
        Tag.de_texto("b"): Dinheiro(5000),
        Tag.de_texto("c"): Dinheiro(5000),
    }
    resultado = destinacoes_proporcionais(principais)
    assert [(d.tag.valor, d.percentual) for d in resultado] == [("a", 50), ("b", 25), ("c", 25)]


def test_destinacoes_proporcionais_com_resto_e_tag_minuscula():
    from gastoba.domain.destinacao import destinacoes_proporcionais

    principais = {
        Tag.de_texto("a"): Dinheiro(1),
        Tag.de_texto("b"): Dinheiro(1),
        Tag.de_texto("c"): Dinheiro(1),
        Tag.de_texto("d"): Dinheiro(100000),
    }
    resultado = destinacoes_proporcionais(principais)
    assert sum(d.percentual for d in resultado) == 100
    assert [d.tag.valor for d in resultado] == ["d"]


def test_destinacoes_proporcionais_sem_principal_e_vazio():
    from gastoba.domain.destinacao import destinacoes_proporcionais

    assert destinacoes_proporcionais({}) == []


def test_resgate_sem_destinacoes_fica_so_na_posicao_quando_nao_ha_principal():
    from gastoba.domain.destinacao import resgate_fica_so_na_posicao

    assert resgate_fica_so_na_posicao(True, [], {}) is True
    assert resgate_fica_so_na_posicao(True, [], {Tag.de_texto("casa"): Dinheiro(0)}) is True


def test_resgate_exige_destinacoes_quando_a_posicao_tem_principal():
    from gastoba.domain.destinacao import resgate_fica_so_na_posicao

    assert resgate_fica_so_na_posicao(True, [], {Tag.de_texto("casa"): Dinheiro(100)}) is False


def test_aporte_ou_resgate_com_destinacoes_nunca_dispensa():
    from gastoba.domain.destinacao import resgate_fica_so_na_posicao

    assert resgate_fica_so_na_posicao(False, [], {}) is False
    assert resgate_fica_so_na_posicao(True, [d("casa", 100)], {}) is False


def _lci(saldo, aplicado):
    from uuid import uuid4

    from gastoba.domain.investimento import Investimento

    return Investimento(
        uuid4(), "x", "LCI", "FIXED_INCOME", None, Dinheiro(saldo), valor_aplicado=aplicado
    )


def test_parte_sem_caixinha_do_rateio_so_existe_com_valor_aplicado_informado():
    from gastoba.domain.investimento import parte_sem_caixinha_do_rateio

    principais = {Tag.de_texto("a"): Dinheiro(1000)}

    assert parte_sem_caixinha_do_rateio(_lci(5000, None), principais) is None
    assert parte_sem_caixinha_do_rateio(_lci(5000, Dinheiro(4000)), principais) == Dinheiro(3000)
    assert parte_sem_caixinha_do_rateio(_lci(5000, Dinheiro(500)), principais) == Dinheiro(0)
