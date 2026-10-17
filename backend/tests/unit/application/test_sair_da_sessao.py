from datetime import timedelta

import pytest

from gastoba.application.autenticar_por_sessao import AutenticarPorSessao
from gastoba.application.entrar_com_senha import EntrarComSenha
from gastoba.application.sair_da_sessao import SairDaSessao
from gastoba.domain.excecoes import NaoAutenticado

DOZE_HORAS = timedelta(hours=12)


@pytest.fixture
def token(semear_usuario, unidade_de_trabalho, hasher, gerador, relogio, limitador) -> str:
    semear_usuario(email="ana@x.com", senha="senha-correta")
    entrar = EntrarComSenha(unidade_de_trabalho, hasher, gerador, relogio, DOZE_HORAS, limitador)
    return entrar.executar(email="ana@x.com", senha="senha-correta").token.valor


@pytest.fixture
def sair(unidade_de_trabalho, relogio):
    return SairDaSessao(unidade_de_trabalho, relogio)


def test_sair_revoga_a_sessao_e_o_token_deixa_de_autenticar(
    sair, token, unidade_de_trabalho, relogio
):
    commits = unidade_de_trabalho.commits

    sair.executar(token)

    [sessao] = unidade_de_trabalho.confirmado.sessoes.values()
    assert sessao.revogada is True
    assert unidade_de_trabalho.commits == commits + 1
    with pytest.raises(NaoAutenticado):
        AutenticarPorSessao(unidade_de_trabalho, relogio).executar(token)


def test_sair_duas_vezes_com_o_mesmo_token_falha_na_segunda(sair, token):
    sair.executar(token)

    with pytest.raises(NaoAutenticado):
        sair.executar(token)


def test_sair_com_sessao_expirada_falha(sair, token, relogio):
    relogio.avancar(DOZE_HORAS)

    with pytest.raises(NaoAutenticado):
        sair.executar(token)


def test_sair_so_revoga_a_propria_sessao(
    sair, token, unidade_de_trabalho, hasher, gerador, relogio, limitador
):
    outra = EntrarComSenha(
        unidade_de_trabalho, hasher, gerador, relogio, DOZE_HORAS, limitador
    ).executar(email="ana@x.com", senha="senha-correta")

    sair.executar(token)

    assert AutenticarPorSessao(unidade_de_trabalho, relogio).executar(outra.token.valor)


@pytest.mark.parametrize("token_invalido", ["", "qualquer", "gapi_Ab12Cd34_" + "a" * 43])
def test_token_malformado_ou_de_chave_nao_sai(sair, token_invalido):
    with pytest.raises(NaoAutenticado):
        sair.executar(token_invalido)
