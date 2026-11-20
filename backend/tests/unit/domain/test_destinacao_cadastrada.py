from uuid import uuid4

import pytest

from gastoba.domain.cor_da_destinacao import CorDaDestinacao
from gastoba.domain.destinacao_cadastrada import DestinacaoCadastrada, IconeDaCaixinha
from gastoba.domain.excecoes import DestinacaoEmUso, IconeInvalido, TagInvalida


def test_criar_normaliza_nome_e_preserva_acentos():
    usuario_id = uuid4()

    destinacao = DestinacaoCadastrada.criar(usuario_id, "  VIAGEM   São João  ")

    assert destinacao.usuario_id == usuario_id
    assert destinacao.nome.valor == "viagem são joão"


@pytest.mark.parametrize("nome", ["a", "á" * 30])
def test_nome_de_um_ate_trinta_code_points_e_valido(nome):
    assert DestinacaoCadastrada.criar(uuid4(), nome).nome.valor == nome.lower()


@pytest.mark.parametrize("nome", ["", "   ", "a" * 31, "a\x00b"])
def test_nome_vazio_longo_ou_nao_imprimivel_e_invalido(nome):
    with pytest.raises(TagInvalida):
        DestinacaoCadastrada.criar(uuid4(), nome)


def test_pode_excluir_quando_nao_ha_referencias():
    destinacao = DestinacaoCadastrada.criar(uuid4(), "viagem")

    destinacao.validar_exclusao(tem_referencias=False)


def test_bloqueia_exclusao_quando_ha_referencias():
    destinacao = DestinacaoCadastrada.criar(uuid4(), "viagem")

    with pytest.raises(DestinacaoEmUso):
        destinacao.validar_exclusao(tem_referencias=True)


def test_icones_sao_seis_codigos_em_portugues():
    assert [i.value for i in IconeDaCaixinha] == [
        "aviao",
        "casa",
        "carro",
        "computador",
        "cofre",
        "exclamacao",
    ]


@pytest.mark.parametrize("codigo", [i.value for i in IconeDaCaixinha])
def test_de_codigo_aceita_os_seis_icones(codigo):
    assert IconeDaCaixinha.de_codigo(codigo).value == codigo


@pytest.mark.parametrize("codigo", ["", "foguete", "CASA", " casa", "casa\x00", 7])
def test_de_codigo_recusa_codigo_fora_da_lista_sem_ecoar_o_valor(codigo):
    with pytest.raises(IconeInvalido) as erro:
        IconeDaCaixinha.de_codigo(codigo)
    assert str(codigo) not in str(erro.value) or str(codigo) == ""


def test_icone_e_cor_nulos_sao_o_padrao():
    destinacao = DestinacaoCadastrada.criar(uuid4(), "viagem")

    assert destinacao.icone is None
    assert destinacao.cor is None


def test_criar_aceita_icone_e_cor():
    destinacao = DestinacaoCadastrada.criar(
        uuid4(), "viagem", icone="aviao", cor=CorDaDestinacao.CEU
    )

    assert destinacao.icone is IconeDaCaixinha.AVIAO
    assert destinacao.cor is CorDaDestinacao.CEU


def test_criar_com_icone_invalido_levanta_icone_invalido():
    with pytest.raises(IconeInvalido):
        DestinacaoCadastrada.criar(uuid4(), "viagem", icone="foguete")


def test_com_icone_devolve_outra_instancia_e_nulo_volta_ao_padrao():
    original = DestinacaoCadastrada.criar(uuid4(), "viagem", icone="casa")

    trocada = original.com_icone("carro")
    padrao = original.com_icone(None)

    assert trocada.icone is IconeDaCaixinha.CARRO and trocada.id == original.id
    assert padrao.icone is None
    assert original.icone is IconeDaCaixinha.CASA
    with pytest.raises(IconeInvalido):
        original.com_icone("foguete")
