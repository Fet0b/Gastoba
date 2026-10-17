from datetime import date
from uuid import uuid4

import pytest

from gastoba.domain.conta import Conta
from gastoba.domain.dinheiro import LIMITE_CENTAVOS, Dinheiro
from gastoba.domain.excecoes import DescricaoInvalida, TagInvalida, ValorInvalido
from gastoba.domain.ganho import (
    QUANTIDADE_MAXIMA_DE_TAGS,
    TAMANHO_MAXIMO_DA_DESCRICAO,
    Ganho,
    OrigemDoGanho,
)
from gastoba.domain.tag import Tag


def criar(**alteracoes) -> Ganho:
    argumentos = {
        "conta_id": uuid4(),
        "valor": Dinheiro(500000),
        "descricao": "Salário",
        "data": date(2026, 10, 5),
    } | alteracoes
    return Ganho(**argumentos)


def test_cria_ganho_manual_com_descricao_aparada():
    ganho = criar(descricao="  Salário  ")

    assert ganho.descricao == "Salário"
    assert ganho.origem == OrigemDoGanho.MANUAL
    assert ganho.tags == ()


@pytest.mark.parametrize("valor", [Dinheiro(0), Dinheiro(-1)])
def test_valor_precisa_ser_positivo(valor):
    with pytest.raises(ValorInvalido):
        criar(valor=valor)


@pytest.mark.parametrize("descricao", ["", "   "])
def test_descricao_vazia_e_recusada(descricao):
    with pytest.raises(DescricaoInvalida):
        criar(descricao=descricao)


def test_descricao_no_limite_e_aceita_e_acima_e_recusada():
    criar(descricao="a" * TAMANHO_MAXIMO_DA_DESCRICAO)
    with pytest.raises(DescricaoInvalida):
        criar(descricao="a" * (TAMANHO_MAXIMO_DA_DESCRICAO + 1))


def test_tags_duplicadas_sao_removidas_preservando_a_ordem():
    ganho = criar(tags=(Tag("pix"), Tag("salario"), Tag("pix")))

    assert ganho.tags == (Tag("pix"), Tag("salario"))


def test_mais_de_dez_tags_distintas_e_recusado():
    tags = tuple(Tag(f"t{i}") for i in range(QUANTIDADE_MAXIMA_DE_TAGS + 1))
    with pytest.raises(TagInvalida):
        criar(tags=tags)


def test_ganhos_com_o_mesmo_id_sao_iguais():
    ganho = criar()
    outro = criar(id=ganho.id, descricao="Outro")

    assert ganho == outro
    assert hash(ganho) == hash(outro)


def test_conta_creditar_soma_ao_saldo():
    conta = Conta(usuario_id=uuid4(), nome="Nubank", saldo=Dinheiro(1000))

    conta.creditar(Dinheiro(250))

    assert conta.saldo == Dinheiro(1250)


def test_conta_creditar_alem_do_limite_levanta_valor_invalido():
    conta = Conta(usuario_id=uuid4(), nome="Nubank", saldo=Dinheiro(LIMITE_CENTAVOS))

    with pytest.raises(ValorInvalido):
        conta.creditar(Dinheiro(1))

    assert conta.saldo == Dinheiro(LIMITE_CENTAVOS)
