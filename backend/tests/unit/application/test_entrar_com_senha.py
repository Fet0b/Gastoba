from datetime import timedelta

import pytest

from gastoba.application.entrar_com_senha import EntrarComSenha
from gastoba.domain.email import Email
from gastoba.domain.excecoes import CredenciaisInvalidas, MuitasTentativas
from gastoba.domain.segredo_de_acesso import TipoDeSegredo
from gastoba.domain.usuario import ID_USUARIO_PADRAO, Usuario

DOZE_HORAS = timedelta(hours=12)


@pytest.fixture
def entrar(unidade_de_trabalho, hasher, gerador, relogio, limitador):
    return EntrarComSenha(
        unidade_de_trabalho,
        hasher,
        gerador,
        relogio,
        duracao_da_sessao=DOZE_HORAS,
        limitador_de_tentativas=limitador,
    )


def test_credenciais_certas_criam_sessao_e_devolvem_token_e_expiracao(
    entrar, unidade_de_trabalho, relogio, semear_usuario
):
    usuario = semear_usuario(email="ana@x.com", senha="senha-correta")

    resultado = entrar.executar(email="ana@x.com", senha="senha-correta")

    assert resultado.token.tipo is TipoDeSegredo.SESSAO
    assert resultado.token.valor.startswith("gsess_")
    assert resultado.expira_em == relogio.agora() + DOZE_HORAS
    assert unidade_de_trabalho.commits == 1
    [sessao] = unidade_de_trabalho.confirmado.sessoes.values()
    assert sessao.usuario_id == usuario.id
    assert sessao.hash_do_segredo == resultado.token.hash_sha256
    assert sessao.criada_em == relogio.agora()
    assert sessao.expira_em == resultado.expira_em
    assert sessao.revogada is False


def test_email_com_maiusculas_e_espacos_e_normalizado(entrar, semear_usuario):
    semear_usuario(email="ana@x.com", senha="senha-correta")

    assert entrar.executar(email="  ANA@X.com ", senha="senha-correta").token


def test_cada_entrada_cria_uma_sessao_com_token_diferente(
    entrar, unidade_de_trabalho, semear_usuario
):
    semear_usuario()

    primeiro = entrar.executar(email="ana@x.com", senha="senha-correta")
    segundo = entrar.executar(email="ana@x.com", senha="senha-correta")

    assert primeiro.token != segundo.token
    assert len(unidade_de_trabalho.confirmado.sessoes) == 2


def test_senha_errada_e_email_inexistente_dao_o_mesmo_erro_e_a_mesma_mensagem(
    entrar, unidade_de_trabalho, semear_usuario
):
    semear_usuario(email="ana@x.com", senha="senha-correta")

    with pytest.raises(CredenciaisInvalidas) as senha_errada:
        entrar.executar(email="ana@x.com", senha="senha-errada")
    with pytest.raises(CredenciaisInvalidas) as email_inexistente:
        entrar.executar(email="bia@x.com", senha="senha-correta")

    assert str(senha_errada.value) == str(email_inexistente.value)
    assert unidade_de_trabalho.confirmado.sessoes == {}
    assert unidade_de_trabalho.commits == 0


def test_email_inexistente_executa_a_verificacao_falsa_para_igualar_o_tempo(entrar, hasher):
    with pytest.raises(CredenciaisInvalidas):
        entrar.executar(email="bia@x.com", senha="senha-correta")

    assert hasher.verificacoes_falsas == 1
    assert hasher.verificacoes == 0


def test_senha_errada_executa_a_verificacao_real_uma_vez(entrar, hasher, semear_usuario):
    semear_usuario()

    with pytest.raises(CredenciaisInvalidas):
        entrar.executar(email="ana@x.com", senha="senha-errada")

    assert hasher.verificacoes == 1
    assert hasher.verificacoes_falsas == 0


def test_usuario_sem_senha_como_o_padrao_herdado_nao_entra(entrar, unidade_de_trabalho, hasher):
    unidade_de_trabalho.confirmado.usuarios[ID_USUARIO_PADRAO] = Usuario(
        "Padrão", id=ID_USUARIO_PADRAO, email=Email("ana@x.com")
    )

    with pytest.raises(CredenciaisInvalidas):
        entrar.executar(email="ana@x.com", senha="senha-correta")

    assert hasher.verificacoes_falsas == 1


@pytest.mark.parametrize(
    ("email", "senha"),
    [("sem-arroba", "senha-correta"), ("ana@x.com", "curta"), ("ana@x.com", "s" * 129)],
)
def test_email_ou_senha_fora_do_formato_dao_credenciais_invalidas_sem_hash(
    entrar, hasher, semear_usuario, email, senha
):
    semear_usuario()

    with pytest.raises(CredenciaisInvalidas):
        entrar.executar(email=email, senha=senha)

    assert hasher.verificacoes == 0


# Limite de tentativas


def test_cada_tentativa_conta_para_o_email_normalizado_e_para_a_origem(entrar, limitador):
    with pytest.raises(CredenciaisInvalidas):
        entrar.executar(email=" ANA@x.com", senha="senha-errada", origem="10.0.0.7")

    assert limitador.tentativas == [("email:ana@x.com", "origem:10.0.0.7")]
    assert limitador.zeradas == []
    assert limitador.descontadas == []


def test_sem_origem_conta_so_o_email(entrar, limitador):
    with pytest.raises(CredenciaisInvalidas):
        entrar.executar(email="ana@x.com", senha="senha-errada")

    assert limitador.tentativas == [("email:ana@x.com",)]


def test_email_fora_do_formato_conta_so_a_origem(entrar, limitador):
    with pytest.raises(CredenciaisInvalidas):
        entrar.executar(email="sem-arroba", senha="senha-correta", origem="10.0.0.7")

    assert limitador.tentativas == [("origem:10.0.0.7",)]


def test_sucesso_zera_o_email_e_desconta_a_tentativa_da_origem(entrar, limitador, semear_usuario):
    semear_usuario()

    entrar.executar(email="ana@x.com", senha="senha-correta", origem="10.0.0.7")

    assert limitador.tentativas == [("email:ana@x.com", "origem:10.0.0.7")]
    assert limitador.zeradas == ["email:ana@x.com"]
    assert limitador.descontadas == ["origem:10.0.0.7"]


def test_bloqueado_recusa_sem_hash_nem_sessao_mesmo_com_a_senha_certa(
    entrar, limitador, hasher, unidade_de_trabalho, semear_usuario
):
    semear_usuario()
    limitador.bloqueado = True

    with pytest.raises(MuitasTentativas) as erro:
        entrar.executar(email="ana@x.com", senha="senha-correta", origem="10.0.0.7")

    assert erro.value.segundos_para_tentar_de_novo == 60
    assert hasher.verificacoes == 0
    assert hasher.verificacoes_falsas == 0
    assert unidade_de_trabalho.confirmado.sessoes == {}
