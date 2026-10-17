from datetime import timedelta

import pytest

from gastoba.application.autenticacao import MeioDeAutenticacao
from gastoba.application.autenticar_por_chave_de_api import AutenticarPorChaveDeApi
from gastoba.application.criar_chave_de_api import CriarChaveDeApi
from gastoba.application.revogar_chave_de_api import RevogarChaveDeApi
from gastoba.domain.chave_de_api import EscopoDaChave
from gastoba.domain.excecoes import NaoAutenticado


@pytest.fixture
def usuario(semear_usuario):
    return semear_usuario()


@pytest.fixture
def criar(unidade_de_trabalho, gerador, relogio):
    return CriarChaveDeApi(unidade_de_trabalho, gerador, relogio)


@pytest.fixture
def criada(criar, usuario):
    return criar.executar(usuario.id, nome="Script", escopo=EscopoDaChave.LEITURA)


@pytest.fixture
def autenticar(unidade_de_trabalho, relogio):
    return AutenticarPorChaveDeApi(unidade_de_trabalho, relogio)


def _gravada(unidade_de_trabalho, criada):
    return unidade_de_trabalho.confirmado.chaves_de_api[criada.chave.id]


def test_chave_ativa_devolve_o_usuario_com_o_escopo_da_chave(autenticar, criada, usuario):
    autenticacao = autenticar.executar(criada.segredo.valor)

    assert autenticacao.usuario == usuario
    assert autenticacao.meio is MeioDeAutenticacao.CHAVE_DE_API
    assert autenticacao.escopo is EscopoDaChave.LEITURA


def test_primeiro_uso_e_registrado(autenticar, criada, unidade_de_trabalho, relogio):
    autenticar.executar(criada.segredo.valor)

    assert _gravada(unidade_de_trabalho, criada).ultimo_uso == relogio.agora()


def test_ultimo_uso_e_atualizado_no_maximo_uma_vez_por_minuto(
    autenticar, criada, unidade_de_trabalho, relogio
):
    primeiro_uso = relogio.agora()
    autenticar.executar(criada.segredo.valor)
    commits = unidade_de_trabalho.commits

    relogio.avancar(timedelta(seconds=59))
    autenticar.executar(criada.segredo.valor)

    assert _gravada(unidade_de_trabalho, criada).ultimo_uso == primeiro_uso
    assert unidade_de_trabalho.commits == commits

    relogio.avancar(timedelta(seconds=1))
    autenticar.executar(criada.segredo.valor)

    assert _gravada(unidade_de_trabalho, criada).ultimo_uso == primeiro_uso + timedelta(minutes=1)
    assert unidade_de_trabalho.commits == commits + 1


def test_chave_revogada_nao_autentica(autenticar, criada, usuario, unidade_de_trabalho):
    RevogarChaveDeApi(unidade_de_trabalho).executar(usuario.id, criada.chave.id)

    with pytest.raises(NaoAutenticado):
        autenticar.executar(criada.segredo.valor)


def test_chave_expirada_nao_autentica(autenticar, criar, usuario, relogio):
    criada = criar.executar(
        usuario.id,
        nome="Curta",
        escopo=EscopoDaChave.ESCRITA,
        expira_em=relogio.agora() + timedelta(days=1),
    )
    relogio.avancar(timedelta(days=1) - timedelta(seconds=1))
    assert autenticar.executar(criada.segredo.valor)

    relogio.avancar(timedelta(seconds=1))
    with pytest.raises(NaoAutenticado):
        autenticar.executar(criada.segredo.valor)


def test_chave_que_falha_nao_registra_uso(autenticar, criada, usuario, unidade_de_trabalho):
    RevogarChaveDeApi(unidade_de_trabalho).executar(usuario.id, criada.chave.id)

    with pytest.raises(NaoAutenticado):
        autenticar.executar(criada.segredo.valor)

    assert _gravada(unidade_de_trabalho, criada).ultimo_uso is None


def test_segredo_desconhecido_nao_autentica(autenticar, criada):
    with pytest.raises(NaoAutenticado):
        autenticar.executar(f"gapi_{criada.chave.prefixo}_" + "z" * 43)


def test_prefixo_publico_trocado_nao_autentica(autenticar, criada, unidade_de_trabalho):
    gravada = _gravada(unidade_de_trabalho, criada)
    gravada.prefixo = "Outro123"

    with pytest.raises(NaoAutenticado):
        autenticar.executar(criada.segredo.valor)


@pytest.mark.parametrize(
    "token_invalido", ["", "qualquer", "gapi_curto", "gsess_" + "a" * 43, "gapi_Ab12Cd34_x"]
)
def test_token_malformado_ou_de_sessao_nao_autentica(autenticar, token_invalido):
    with pytest.raises(NaoAutenticado):
        autenticar.executar(token_invalido)


def test_dono_da_chave_removido_nao_autentica(autenticar, criada, usuario, unidade_de_trabalho):
    del unidade_de_trabalho.confirmado.usuarios[usuario.id]

    with pytest.raises(NaoAutenticado):
        autenticar.executar(criada.segredo.valor)
