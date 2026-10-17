from datetime import date
from uuid import uuid4

from gastoba.application.listar_tags import ListarTags
from gastoba.application.registrar_gasto import RegistrarGasto
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.tag import Tag

USUARIO_ID = uuid4()


def registrar(unidade_de_trabalho, usuario_id, conta_id, tags, categoria):
    RegistrarGasto(unidade_de_trabalho).executar(
        usuario_id=usuario_id,
        conta_id=conta_id,
        valor=Dinheiro(100),
        descricao="Gasto",
        data=date(2026, 10, 10),
        categoria=categoria,
        tags=tags,
    )


def test_sem_gastos_devolve_lista_vazia(unidade_de_trabalho, semear_conta):
    semear_conta(usuario_id=USUARIO_ID)

    assert ListarTags(unidade_de_trabalho).executar(USUARIO_ID) == []


def test_tags_distintas_ordenadas_sem_tags_de_outro_usuario(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID)
    outro_usuario = uuid4()
    alheia = semear_conta(usuario_id=outro_usuario)
    lazer = CategoriaDoGasto.LAZER
    fixo = CategoriaDoGasto.GASTO_FIXO
    registrar(unidade_de_trabalho, USUARIO_ID, conta.id, ["Pix", "mercado"], fixo)
    registrar(unidade_de_trabalho, USUARIO_ID, conta.id, ["ifood", "pix"], lazer)
    registrar(unidade_de_trabalho, outro_usuario, alheia.id, ["alheia"], lazer)

    tags = ListarTags(unidade_de_trabalho).executar(USUARIO_ID)

    assert tags == [Tag("ifood"), Tag("mercado"), Tag("pix")]


def test_mesma_tag_em_categorias_diferentes_aparece_uma_vez(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID)
    registrar(unidade_de_trabalho, USUARIO_ID, conta.id, ["mercado"], CategoriaDoGasto.CONFORTO)
    registrar(unidade_de_trabalho, USUARIO_ID, conta.id, ["mercado"], CategoriaDoGasto.GASTO_FIXO)

    assert ListarTags(unidade_de_trabalho).executar(USUARIO_ID) == [Tag("mercado")]
