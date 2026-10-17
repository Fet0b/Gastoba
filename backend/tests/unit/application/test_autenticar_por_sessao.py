from datetime import timedelta

import pytest

from gastoba.application.autenticacao import MeioDeAutenticacao
from gastoba.application.autenticar_por_sessao import AutenticarPorSessao
from gastoba.application.entrar_com_senha import EntrarComSenha
from gastoba.domain.excecoes import NaoAutenticado

DOZE_HORAS = timedelta(hours=12)


@pytest.fixture
def usuario(semear_usuario):
    return semear_usuario(email="ana@x.com", senha="senha-correta")


@pytest.fixture
def token(usuario, unidade_de_trabalho, hasher, gerador, relogio, limitador) -> str:
    entrar = EntrarComSenha(unidade_de_trabalho, hasher, gerador, relogio, DOZE_HORAS, limitador)
    return entrar.executar(email="ana@x.com", senha="senha-correta").token.valor


@pytest.fixture
def autenticar(unidade_de_trabalho, relogio):
    return AutenticarPorSessao(unidade_de_trabalho, relogio)


def test_token_de_sessao_ativa_devolve_o_usuario_com_todos_os_acessos(autenticar, token, usuario):
    autenticacao = autenticar.executar(token)

    assert autenticacao.usuario == usuario
    assert autenticacao.usuario.email == usuario.email
    assert autenticacao.meio is MeioDeAutenticacao.SESSAO
    assert autenticacao.escopo is None


def test_sessao_vale_ate_um_instante_antes_de_expirar(autenticar, token, relogio):
    relogio.avancar(DOZE_HORAS - timedelta(seconds=1))

    assert autenticar.executar(token)


def test_sessao_expirada_nao_autentica(autenticar, token, relogio):
    relogio.avancar(DOZE_HORAS)

    with pytest.raises(NaoAutenticado):
        autenticar.executar(token)


def test_sessao_revogada_nao_autentica(autenticar, token, unidade_de_trabalho):
    [sessao] = unidade_de_trabalho.confirmado.sessoes.values()
    sessao.revogar()

    with pytest.raises(NaoAutenticado):
        autenticar.executar(token)


def test_token_valido_mas_sem_sessao_gravada_nao_autentica(autenticar, usuario):
    with pytest.raises(NaoAutenticado):
        autenticar.executar("gsess_" + "z" * 43)


@pytest.mark.parametrize(
    "token_invalido", ["", "qualquer", "gsess_curto", "Bearer gsess_" + "a" * 43]
)
def test_token_malformado_nao_autentica(autenticar, token_invalido):
    with pytest.raises(NaoAutenticado):
        autenticar.executar(token_invalido)


def test_chave_de_api_nao_serve_como_token_de_sessao(autenticar):
    with pytest.raises(NaoAutenticado):
        autenticar.executar("gapi_Ab12Cd34_" + "a" * 43)


def test_usuario_removido_nao_autentica(autenticar, token, usuario, unidade_de_trabalho):
    del unidade_de_trabalho.confirmado.usuarios[usuario.id]

    with pytest.raises(NaoAutenticado):
        autenticar.executar(token)


def test_todos_os_casos_de_falha_tem_a_mesma_mensagem(autenticar, token, relogio):
    with pytest.raises(NaoAutenticado) as malformado:
        autenticar.executar("qualquer")
    relogio.avancar(DOZE_HORAS)
    with pytest.raises(NaoAutenticado) as expirado:
        autenticar.executar(token)

    assert str(malformado.value) == str(expirado.value)


def test_autenticar_nao_grava_nada(autenticar, token, unidade_de_trabalho):
    commits = unidade_de_trabalho.commits

    autenticar.executar(token)

    assert unidade_de_trabalho.commits == commits
