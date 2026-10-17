from uuid import uuid4

import pytest

from gastoba.application.criar_chave_de_api import CriarChaveDeApi
from gastoba.application.revogar_chave_de_api import RevogarChaveDeApi
from gastoba.domain.chave_de_api import EscopoDaChave
from gastoba.domain.excecoes import ChaveDeApiNaoEncontrada

USUARIO_ID = uuid4()


@pytest.fixture
def chave(unidade_de_trabalho, gerador, relogio):
    criar = CriarChaveDeApi(unidade_de_trabalho, gerador, relogio)
    return criar.executar(USUARIO_ID, nome="Script", escopo=EscopoDaChave.LEITURA).chave


def test_revoga_a_chave_do_usuario(unidade_de_trabalho, chave):
    commits = unidade_de_trabalho.commits

    RevogarChaveDeApi(unidade_de_trabalho).executar(USUARIO_ID, chave.id)

    assert unidade_de_trabalho.confirmado.chaves_de_api[chave.id].revogada is True
    assert unidade_de_trabalho.commits == commits + 1


def test_chave_de_outro_usuario_e_tratada_como_inexistente(unidade_de_trabalho, chave):
    with pytest.raises(ChaveDeApiNaoEncontrada):
        RevogarChaveDeApi(unidade_de_trabalho).executar(uuid4(), chave.id)

    assert unidade_de_trabalho.confirmado.chaves_de_api[chave.id].revogada is False


def test_chave_inexistente(unidade_de_trabalho):
    with pytest.raises(ChaveDeApiNaoEncontrada):
        RevogarChaveDeApi(unidade_de_trabalho).executar(USUARIO_ID, uuid4())


def test_chave_ja_revogada_e_tratada_como_inexistente(unidade_de_trabalho, chave):
    revogar = RevogarChaveDeApi(unidade_de_trabalho)
    revogar.executar(USUARIO_ID, chave.id)

    with pytest.raises(ChaveDeApiNaoEncontrada):
        revogar.executar(USUARIO_ID, chave.id)
