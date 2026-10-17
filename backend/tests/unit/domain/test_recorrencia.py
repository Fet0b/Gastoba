from datetime import date
from uuid import uuid4

import pytest

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    DescricaoInvalida,
    RecorrenciaInvalida,
    TagInvalida,
    ValorInvalido,
)
from gastoba.domain.mes import Mes
from gastoba.domain.recorrencia import (
    QUANTIDADE_MAXIMA_DE_TAGS,
    Recorrencia,
    TipoDeRecorrencia,
)
from gastoba.domain.tag import Tag


def salario(**alteracoes) -> Recorrencia:
    argumentos = {
        "usuario_id": uuid4(),
        "tipo": TipoDeRecorrencia.GANHO,
        "conta_id": uuid4(),
        "valor": Dinheiro(500000),
        "descricao": "Salário",
        "dia_do_mes": 5,
        "inicio": date(2026, 8, 1),
    } | alteracoes
    return Recorrencia(**argumentos)


def aluguel(**alteracoes) -> Recorrencia:
    return salario(
        tipo=TipoDeRecorrencia.GASTO,
        descricao="Aluguel",
        categoria=CategoriaDoGasto.GASTO_FIXO,
        **alteracoes,
    )


def test_cria_ganho_sem_categoria_e_gasto_com_categoria():
    assert salario().categoria is None
    assert aluguel().categoria == CategoriaDoGasto.GASTO_FIXO
    assert salario().ativa is True


def test_gasto_sem_categoria_e_ganho_com_categoria_sao_recusados():
    with pytest.raises(RecorrenciaInvalida):
        salario(tipo=TipoDeRecorrencia.GASTO)
    with pytest.raises(RecorrenciaInvalida):
        salario(categoria=CategoriaDoGasto.LAZER)


@pytest.mark.parametrize("dia", [0, 32, -1])
def test_dia_do_mes_fora_de_1_a_31_e_recusado(dia):
    with pytest.raises(RecorrenciaInvalida):
        salario(dia_do_mes=dia)


@pytest.mark.parametrize("dia", [1, 31])
def test_dia_do_mes_nos_limites_e_aceito(dia):
    assert salario(dia_do_mes=dia).dia_do_mes == dia


def test_valor_e_descricao_seguem_as_regras_do_gasto():
    with pytest.raises(ValorInvalido):
        salario(valor=Dinheiro(0))
    with pytest.raises(DescricaoInvalida):
        salario(descricao="   ")
    with pytest.raises(DescricaoInvalida):
        salario(descricao="a" * 201)
    assert salario(descricao="  Salário  ").descricao == "Salário"


def test_fim_antes_do_inicio_e_recusado_e_no_mesmo_dia_e_aceito():
    with pytest.raises(RecorrenciaInvalida):
        salario(fim=date(2026, 7, 31))
    assert salario(fim=date(2026, 8, 1)).fim == date(2026, 8, 1)


def test_tags_duplicadas_saem_e_mais_de_dez_e_recusado():
    assert salario(tags=(Tag("a"), Tag("b"), Tag("a"))).tags == (Tag("a"), Tag("b"))
    with pytest.raises(TagInvalida):
        salario(tags=tuple(Tag(f"t{i}") for i in range(QUANTIDADE_MAXIMA_DE_TAGS + 1)))


def test_ocorrencias_do_inicio_ate_hoje_com_a_data_do_mes():
    ocorrencias = salario(inicio=date(2026, 8, 1)).ocorrencias_ate(date(2026, 10, 12))

    assert ocorrencias == [
        (Mes(2026, 8), date(2026, 8, 5)),
        (Mes(2026, 9), date(2026, 9, 5)),
        (Mes(2026, 10), date(2026, 10, 5)),
    ]


def test_ocorrencia_do_mes_atual_so_vale_depois_do_dia():
    recorrencia = salario(dia_do_mes=20, inicio=date(2026, 8, 1))

    assert [m for m, _ in recorrencia.ocorrencias_ate(date(2026, 10, 19))] == [
        Mes(2026, 8),
        Mes(2026, 9),
    ]
    assert Mes(2026, 10) in [m for m, _ in recorrencia.ocorrencias_ate(date(2026, 10, 20))]


def test_inicio_no_meio_do_mes_pula_o_dia_que_ja_passou():
    recorrencia = salario(dia_do_mes=5, inicio=date(2026, 10, 20))

    assert recorrencia.ocorrencias_ate(date(2026, 10, 31)) == []
    assert recorrencia.ocorrencias_ate(date(2026, 11, 5)) == [(Mes(2026, 11), date(2026, 11, 5))]


def test_inicio_no_proprio_dia_conta():
    recorrencia = salario(dia_do_mes=5, inicio=date(2026, 10, 5))

    assert recorrencia.ocorrencias_ate(date(2026, 10, 5)) == [(Mes(2026, 10), date(2026, 10, 5))]


def test_fim_limita_as_ocorrencias_inclusive():
    recorrencia = salario(dia_do_mes=5, inicio=date(2026, 8, 1), fim=date(2026, 9, 5))

    assert [m for m, _ in recorrencia.ocorrencias_ate(date(2026, 12, 31))] == [
        Mes(2026, 8),
        Mes(2026, 9),
    ]


def test_dia_31_cai_no_ultimo_dia_de_cada_mes_curto():
    recorrencia = salario(dia_do_mes=31, inicio=date(2026, 1, 1))

    datas = [data for _, data in recorrencia.ocorrencias_ate(date(2026, 4, 30))]

    assert datas == [date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31), date(2026, 4, 30)]


def test_dia_29_em_fevereiro_de_ano_bissexto_e_nao_bissexto():
    recorrencia = salario(dia_do_mes=29, inicio=date(2024, 2, 1))

    datas = [data for _, data in recorrencia.ocorrencias_ate(date(2025, 3, 31))]

    assert date(2024, 2, 29) in datas
    assert date(2025, 2, 28) in datas


def test_vira_o_ano():
    recorrencia = salario(dia_do_mes=10, inicio=date(2026, 11, 1))

    assert [m for m, _ in recorrencia.ocorrencias_ate(date(2027, 1, 10))] == [
        Mes(2026, 11),
        Mes(2026, 12),
        Mes(2027, 1),
    ]


def test_hoje_antes_do_inicio_nao_tem_ocorrencias():
    assert salario(inicio=date(2026, 10, 1)).ocorrencias_ate(date(2026, 9, 30)) == []


def test_ocorrencias_no_ultimo_mes_do_calendario_nao_estouram():
    recorrencia = salario(dia_do_mes=1, inicio=date(9999, 12, 1))

    assert recorrencia.ocorrencias_ate(date(9999, 12, 31)) == [(Mes(9999, 12), date(9999, 12, 1))]


def test_igualdade_e_pelo_id():
    uma = salario()
    outra = salario(id=uma.id, descricao="Outra")

    assert uma == outra
    assert hash(uma) == hash(outra)
