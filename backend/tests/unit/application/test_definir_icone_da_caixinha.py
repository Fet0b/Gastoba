from copy import deepcopy
from uuid import uuid4

import pytest

from gastoba.application.criar_destinacao_cadastrada import CriarDestinacaoCadastrada
from gastoba.application.definir_icone_da_caixinha import DefinirIconeDaCaixinha
from gastoba.application.listar_destinacoes_cadastradas import ListarDestinacoesCadastradas
from gastoba.domain.cor_da_destinacao import CorDaDestinacao
from gastoba.domain.destinacao_cadastrada import IconeDaCaixinha
from gastoba.domain.excecoes import DestinacaoCadastradaNaoEncontrada, IconeInvalido, TagInvalida
from gastoba.domain.tag import Tag


def _criar(uow, usuario_id, nome="viagem", **kwargs):
    return CriarDestinacaoCadastrada(uow).executar(usuario_id, nome, **kwargs)


def test_grava_o_icone_da_caixinha_do_dono(unidade_de_trabalho):
    usuario_id = uuid4()
    caixinha = _criar(unidade_de_trabalho, usuario_id)

    resultado = DefinirIconeDaCaixinha(unidade_de_trabalho).executar(
        usuario_id, caixinha.id, "aviao"
    )

    assert resultado.icone is IconeDaCaixinha.AVIAO
    assert ListarDestinacoesCadastradas(unidade_de_trabalho).executar(usuario_id)[0].icone is (
        IconeDaCaixinha.AVIAO
    )


def test_nulo_volta_ao_padrao(unidade_de_trabalho):
    usuario_id = uuid4()
    caixinha = _criar(unidade_de_trabalho, usuario_id, icone="casa")

    resultado = DefinirIconeDaCaixinha(unidade_de_trabalho).executar(usuario_id, caixinha.id, None)

    assert resultado.icone is None


def test_caixinha_de_outra_pessoa_ou_inexistente_e_nao_encontrada(unidade_de_trabalho):
    dona = uuid4()
    caixinha = _criar(unidade_de_trabalho, dona)
    commits = unidade_de_trabalho.commits

    for alvo in (caixinha.id, uuid4()):
        with pytest.raises(DestinacaoCadastradaNaoEncontrada):
            DefinirIconeDaCaixinha(unidade_de_trabalho).executar(uuid4(), alvo, "casa")

    assert unidade_de_trabalho.commits == commits
    assert ListarDestinacoesCadastradas(unidade_de_trabalho).executar(dona)[0].icone is None


def test_icone_invalido_nao_grava(unidade_de_trabalho):
    usuario_id = uuid4()
    caixinha = _criar(unidade_de_trabalho, usuario_id)
    commits = unidade_de_trabalho.commits

    with pytest.raises(IconeInvalido):
        DefinirIconeDaCaixinha(unidade_de_trabalho).executar(usuario_id, caixinha.id, "foguete")

    assert unidade_de_trabalho.commits == commits


def test_nenhuma_outra_porta_e_escrita(unidade_de_trabalho):
    usuario_id = uuid4()
    caixinha = _criar(unidade_de_trabalho, usuario_id, cor=CorDaDestinacao.CEU)
    antes = deepcopy(unidade_de_trabalho.confirmado)

    DefinirIconeDaCaixinha(unidade_de_trabalho).executar(usuario_id, caixinha.id, "carro")

    depois = unidade_de_trabalho.confirmado
    for campo in vars(antes):
        if campo != "catalogo_de_destinacoes":
            assert getattr(depois, campo) == getattr(antes, campo), campo
    assert depois.cores_das_destinacoes == {(usuario_id, Tag("viagem")): CorDaDestinacao.CEU}


def test_criar_com_cor_e_icone_grava_tudo_na_mesma_transacao(unidade_de_trabalho):
    usuario_id = uuid4()

    criada = _criar(unidade_de_trabalho, usuario_id, icone="aviao", cor=CorDaDestinacao.CORAL)

    assert criada.icone is IconeDaCaixinha.AVIAO and criada.cor is CorDaDestinacao.CORAL
    assert unidade_de_trabalho.commits == 1
    assert ListarDestinacoesCadastradas(unidade_de_trabalho).executar(usuario_id) == [criada]


def test_criar_sem_cor_nem_icone_continua_igual(unidade_de_trabalho):
    criada = _criar(unidade_de_trabalho, uuid4())

    assert criada.icone is None and criada.cor is None
    assert unidade_de_trabalho.confirmado.cores_das_destinacoes == {}


def test_icone_invalido_na_criacao_nao_cria_nada(unidade_de_trabalho):
    usuario_id = uuid4()

    with pytest.raises(IconeInvalido):
        _criar(unidade_de_trabalho, usuario_id, icone="foguete", cor=CorDaDestinacao.CEU)

    assert unidade_de_trabalho.commits == 0
    assert ListarDestinacoesCadastradas(unidade_de_trabalho).executar(usuario_id) == []
    assert unidade_de_trabalho.confirmado.cores_das_destinacoes == {}


def test_nome_invalido_na_criacao_nao_grava_cor(unidade_de_trabalho):
    with pytest.raises(TagInvalida):
        _criar(unidade_de_trabalho, uuid4(), nome="\x00", cor=CorDaDestinacao.CEU)

    assert unidade_de_trabalho.confirmado.cores_das_destinacoes == {}


def test_falha_ao_gravar_a_cor_desfaz_o_cadastro(unidade_de_trabalho, monkeypatch):
    def falha(self, usuario_id, tag, cor):
        raise RuntimeError("falha simulada")

    with unidade_de_trabalho as uow:
        monkeypatch.setattr(type(uow.cores_das_destinacoes), "definir", falha)
    usuario_id = uuid4()

    with pytest.raises(RuntimeError):
        _criar(unidade_de_trabalho, usuario_id, cor=CorDaDestinacao.CEU)

    assert unidade_de_trabalho.commits == 0
    assert ListarDestinacoesCadastradas(unidade_de_trabalho).executar(usuario_id) == []
