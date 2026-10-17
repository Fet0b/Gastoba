import pytest

from gastoba.application.cadastrar_usuario import CadastrarUsuario
from gastoba.domain.email import Email
from gastoba.domain.excecoes import (
    CadastroFechado,
    EmailInvalido,
    EmailJaCadastrado,
    NomeInvalido,
    SenhaInvalida,
)
from gastoba.domain.senha import SenhaEmClaro


def _cadastrar(unidade_de_trabalho, hasher, cadastro_aberto=True):
    return CadastrarUsuario(unidade_de_trabalho, hasher, cadastro_aberto=cadastro_aberto)


def test_cadastra_usuario_com_email_normalizado_e_senha_com_hash(unidade_de_trabalho, hasher):
    usuario = _cadastrar(unidade_de_trabalho, hasher).executar(
        nome="Ana", email="  Ana@X.com ", senha="senha-forte-1"
    )

    assert usuario.nome == "Ana"
    assert usuario.email == Email("ana@x.com")
    assert hasher.verificar(SenhaEmClaro("senha-forte-1"), usuario.senha_hash)
    assert unidade_de_trabalho.commits == 1
    gravado = unidade_de_trabalho.confirmado.usuarios[usuario.id]
    assert gravado.email == Email("ana@x.com")
    assert "senha-forte-1" not in gravado.senha_hash.valor


def test_cadastro_fechado_recusa_sem_tocar_no_banco_nem_no_hasher(unidade_de_trabalho, hasher):
    with pytest.raises(CadastroFechado):
        _cadastrar(unidade_de_trabalho, hasher, cadastro_aberto=False).executar(
            nome="Ana", email="ana@x.com", senha="senha-forte-1"
        )

    assert unidade_de_trabalho.confirmado.usuarios == {}
    assert hasher.hashes == 0


def test_email_ja_cadastrado_com_outra_caixa_e_recusado(
    unidade_de_trabalho, hasher, semear_usuario
):
    semear_usuario(email="ana@x.com")

    with pytest.raises(EmailJaCadastrado):
        _cadastrar(unidade_de_trabalho, hasher).executar(
            nome="Outra", email=" ANA@x.com", senha="senha-forte-1"
        )

    assert len(unidade_de_trabalho.confirmado.usuarios) == 1
    assert unidade_de_trabalho.commits == 0
    assert hasher.hashes == 0


@pytest.mark.parametrize(
    ("nome", "email", "senha", "erro"),
    [
        ("Ana", "sem-arroba", "senha-forte-1", EmailInvalido),
        ("Ana", "ana@x.com", "curta", SenhaInvalida),
        ("Ana", "ana@x.com", "s" * 129, SenhaInvalida),
        ("  ", "ana@x.com", "senha-forte-1", NomeInvalido),
    ],
)
def test_dados_invalidos_nao_gravam_nem_calculam_hash(
    unidade_de_trabalho, hasher, nome, email, senha, erro
):
    with pytest.raises(erro):
        _cadastrar(unidade_de_trabalho, hasher).executar(nome=nome, email=email, senha=senha)

    assert unidade_de_trabalho.confirmado.usuarios == {}
    assert hasher.hashes == 0
