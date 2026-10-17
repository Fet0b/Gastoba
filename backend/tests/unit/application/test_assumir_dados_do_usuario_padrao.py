import pytest

from gastoba.application.assumir_dados_do_usuario_padrao import AssumirDadosDoUsuarioPadrao
from gastoba.domain.email import Email
from gastoba.domain.excecoes import (
    EmailInvalido,
    EmailJaCadastrado,
    NomeInvalido,
    SenhaInvalida,
    UsuarioPadraoJaAssumido,
)
from gastoba.domain.senha import SenhaEmClaro
from gastoba.domain.usuario import ID_USUARIO_PADRAO, Usuario


@pytest.fixture
def assumir(unidade_de_trabalho, hasher):
    return AssumirDadosDoUsuarioPadrao(unidade_de_trabalho, hasher)


@pytest.fixture
def padrao(unidade_de_trabalho):
    usuario = Usuario("Usuário", id=ID_USUARIO_PADRAO)
    unidade_de_trabalho.confirmado.usuarios[ID_USUARIO_PADRAO] = usuario
    return usuario


def test_preenche_email_nome_e_senha_mantendo_o_id(assumir, padrao, unidade_de_trabalho, hasher):
    usuario = assumir.executar(nome="Ana", email=" Ana@X.com", senha="senha-forte-1")

    assert usuario.id == ID_USUARIO_PADRAO
    gravado = unidade_de_trabalho.confirmado.usuarios[ID_USUARIO_PADRAO]
    assert gravado.nome == "Ana"
    assert gravado.email == Email("ana@x.com")
    assert hasher.verificar(SenhaEmClaro("senha-forte-1"), gravado.senha_hash)
    assert len(unidade_de_trabalho.confirmado.usuarios) == 1
    assert unidade_de_trabalho.commits == 1


def test_recusa_se_o_padrao_ja_tem_credenciais(assumir, padrao, unidade_de_trabalho, hasher):
    assumir.executar(nome="Ana", email="ana@x.com", senha="senha-forte-1")

    with pytest.raises(UsuarioPadraoJaAssumido):
        assumir.executar(nome="Bia", email="bia@x.com", senha="senha-forte-2")

    gravado = unidade_de_trabalho.confirmado.usuarios[ID_USUARIO_PADRAO]
    assert gravado.email == Email("ana@x.com")
    assert unidade_de_trabalho.commits == 1


def test_recusa_se_o_padrao_nao_existe(assumir, unidade_de_trabalho):
    with pytest.raises(LookupError):
        assumir.executar(nome="Ana", email="ana@x.com", senha="senha-forte-1")

    assert unidade_de_trabalho.commits == 0


def test_email_de_outro_usuario_e_recusado(assumir, padrao, unidade_de_trabalho, semear_usuario):
    semear_usuario(email="ana@x.com")

    with pytest.raises(EmailJaCadastrado):
        assumir.executar(nome="Ana", email="ana@x.com", senha="senha-forte-1")

    assert unidade_de_trabalho.confirmado.usuarios[ID_USUARIO_PADRAO].email is None
    assert unidade_de_trabalho.commits == 0


@pytest.mark.parametrize(
    ("nome", "email", "senha", "erro"),
    [
        ("Ana", "sem-arroba", "senha-forte-1", EmailInvalido),
        ("Ana", "ana@x.com", "curta", SenhaInvalida),
        ("  ", "ana@x.com", "senha-forte-1", NomeInvalido),
    ],
)
def test_dados_invalidos_nao_gravam_nem_calculam_hash(
    assumir, padrao, unidade_de_trabalho, hasher, nome, email, senha, erro
):
    with pytest.raises(erro):
        assumir.executar(nome=nome, email=email, senha=senha)

    assert unidade_de_trabalho.confirmado.usuarios[ID_USUARIO_PADRAO].email is None
    assert hasher.hashes == 0
