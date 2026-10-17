from datetime import date
from uuid import UUID, uuid4

import pytest

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import DescricaoInvalida, TagInvalida, ValorInvalido
from gastoba.domain.gasto import Gasto, OrigemDoGasto
from gastoba.domain.tag import Tag

DATA = date(2026, 10, 7)
LAZER = CategoriaDoGasto.LAZER


def test_criacao_valida_gera_id_origem_manual_e_limpa_descricao():
    conta_id = uuid4()
    gasto = Gasto(
        conta_id=conta_id,
        valor=Dinheiro(2590),
        descricao="  Mercado  ",
        data=DATA,
        categoria=LAZER,
    )

    assert isinstance(gasto.id, UUID)
    assert gasto.conta_id == conta_id
    assert gasto.origem == OrigemDoGasto.MANUAL
    assert gasto.descricao == "Mercado"
    assert gasto.tags == ()


def test_guarda_a_categoria_informada():
    gasto = Gasto(
        conta_id=uuid4(),
        valor=Dinheiro(100),
        descricao="Aluguel",
        data=DATA,
        categoria=CategoriaDoGasto.GASTO_FIXO,
    )

    assert gasto.categoria is CategoriaDoGasto.GASTO_FIXO


def test_categoria_e_posicional_entre_data_e_tags():
    tags = (Tag("pix"),)

    gasto = Gasto(uuid4(), Dinheiro(100), "Mercado", DATA, CategoriaDoGasto.CONFORTO, tags)

    assert gasto.categoria is CategoriaDoGasto.CONFORTO
    assert gasto.tags == tags


def test_sem_categoria_levanta_type_error():
    with pytest.raises(TypeError):
        Gasto(conta_id=uuid4(), valor=Dinheiro(100), descricao="Mercado", data=DATA)  # type: ignore[call-arg]


def test_mesma_tag_convive_em_categorias_diferentes():
    tags = (Tag("mercado"),)

    g1 = Gasto(
        conta_id=uuid4(),
        valor=Dinheiro(100),
        descricao="Mercado",
        data=DATA,
        categoria=CategoriaDoGasto.CONFORTO,
        tags=tags,
    )
    g2 = Gasto(
        conta_id=uuid4(),
        valor=Dinheiro(100),
        descricao="Mercado",
        data=DATA,
        categoria=CategoriaDoGasto.GASTO_FIXO,
        tags=tags,
    )

    assert g1.tags == g2.tags
    assert g1.categoria is CategoriaDoGasto.CONFORTO
    assert g2.categoria is CategoriaDoGasto.GASTO_FIXO


def test_sem_conta_id_levanta_type_error():
    with pytest.raises(TypeError):
        Gasto(valor=Dinheiro(100), descricao="Mercado", data=DATA, categoria=LAZER)  # type: ignore[call-arg]


@pytest.mark.parametrize("descricao", ["", "   "])
def test_descricao_vazia_ou_so_espacos_e_invalida(descricao):
    with pytest.raises(DescricaoInvalida):
        Gasto(
            conta_id=uuid4(),
            valor=Dinheiro(100),
            descricao=descricao,
            data=DATA,
            categoria=LAZER,
        )


def test_descricao_com_200_caracteres_e_valida():
    gasto = Gasto(
        conta_id=uuid4(),
        valor=Dinheiro(100),
        descricao="a" * 200,
        data=DATA,
        categoria=LAZER,
    )

    assert gasto.descricao == "a" * 200


def test_descricao_com_201_caracteres_e_invalida():
    with pytest.raises(DescricaoInvalida):
        Gasto(
            conta_id=uuid4(),
            valor=Dinheiro(100),
            descricao="a" * 201,
            data=DATA,
            categoria=LAZER,
        )


@pytest.mark.parametrize("centavos", [0, -100])
def test_valor_zero_ou_negativo_e_invalido(centavos):
    with pytest.raises(ValorInvalido):
        Gasto(
            conta_id=uuid4(),
            valor=Dinheiro(centavos),
            descricao="Mercado",
            data=DATA,
            categoria=LAZER,
        )


def test_tags_duplicadas_sao_removidas_preservando_a_ordem():
    tags = tuple(Tag.de_texto(t) for t in ["Pix", "pix", "mercado"])

    gasto = Gasto(
        conta_id=uuid4(),
        valor=Dinheiro(100),
        descricao="Mercado",
        data=DATA,
        categoria=LAZER,
        tags=tags,
    )

    assert gasto.tags == (Tag("pix"), Tag("mercado"))


def test_dez_tags_distintas_sao_validas():
    tags = tuple(Tag(f"tag{i}") for i in range(10))

    gasto = Gasto(
        conta_id=uuid4(),
        valor=Dinheiro(100),
        descricao="Mercado",
        data=DATA,
        categoria=LAZER,
        tags=tags,
    )

    assert len(gasto.tags) == 10


def test_onze_tags_distintas_sao_invalidas():
    tags = tuple(Tag(f"tag{i}") for i in range(11))

    with pytest.raises(TagInvalida):
        Gasto(
            conta_id=uuid4(),
            valor=Dinheiro(100),
            descricao="Mercado",
            data=DATA,
            categoria=LAZER,
            tags=tags,
        )


def test_gastos_com_mesmos_dados_e_ids_diferentes_sao_diferentes():
    conta_id = uuid4()
    g1 = Gasto(
        conta_id=conta_id, valor=Dinheiro(100), descricao="Mercado", data=DATA, categoria=LAZER
    )
    g2 = Gasto(
        conta_id=conta_id, valor=Dinheiro(100), descricao="Mercado", data=DATA, categoria=LAZER
    )

    assert g1 != g2


def test_gastos_com_mesmo_id_sao_iguais_e_tem_mesmo_hash():
    id_compartilhado = uuid4()
    g1 = Gasto(
        conta_id=uuid4(),
        valor=Dinheiro(100),
        descricao="Mercado",
        data=DATA,
        categoria=LAZER,
        id=id_compartilhado,
    )
    g2 = Gasto(
        conta_id=uuid4(),
        valor=Dinheiro(999),
        descricao="Padaria",
        data=DATA,
        categoria=CategoriaDoGasto.CONFORTO,
        id=id_compartilhado,
    )

    assert g1 == g2
    assert hash(g1) == hash(g2)
    assert len({g1, g2}) == 1


def test_gasto_comparado_com_outro_tipo_nao_e_igual():
    gasto = Gasto(
        conta_id=uuid4(), valor=Dinheiro(100), descricao="Mercado", data=DATA, categoria=LAZER
    )

    assert (gasto == "x") is False
