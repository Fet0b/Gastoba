from uuid import UUID, uuid4

import pytest

from gastoba.domain.email import Email
from gastoba.domain.excecoes import NomeInvalido
from gastoba.domain.senha import SenhaComHash
from gastoba.domain.usuario import ID_USUARIO_PADRAO, Usuario


def test_criacao_valida_gera_id_e_limpa_nome():
    usuario = Usuario(nome="  Fulano  ")

    assert isinstance(usuario.id, UUID)
    assert usuario.nome == "Fulano"


@pytest.mark.parametrize("nome", ["", "   ", "a" * 101])
def test_nome_vazio_so_espacos_ou_longo_demais_e_invalido(nome):
    with pytest.raises(NomeInvalido):
        Usuario(nome=nome)


def test_nome_com_100_caracteres_e_valido():
    assert Usuario(nome="a" * 100).nome == "a" * 100


def test_id_do_usuario_padrao_e_fixo():
    assert UUID(int=1) == ID_USUARIO_PADRAO


def test_usuarios_com_mesmo_id_sao_iguais_e_tem_mesmo_hash():
    id_compartilhado = uuid4()
    u1 = Usuario(nome="Fulano", id=id_compartilhado)
    u2 = Usuario(nome="Beltrano", id=id_compartilhado)

    assert u1 == u2
    assert hash(u1) == hash(u2)


def test_usuarios_com_ids_diferentes_sao_diferentes():
    assert Usuario(nome="Fulano") != Usuario(nome="Fulano")


def test_usuario_comparado_com_outro_tipo_nao_e_igual():
    assert (Usuario(nome="Fulano") == "x") is False


def test_usuario_sem_credenciais_por_padrao_como_o_usuario_padrao_herdado():
    usuario = Usuario("Fulano", id=ID_USUARIO_PADRAO)

    assert usuario.email is None
    assert usuario.senha_hash is None
    assert usuario.tem_credenciais is False


def test_usuario_com_email_e_senha_tem_credenciais():
    usuario = Usuario(
        "Fulano",
        email=Email.de_texto("fulano@x.com"),
        senha_hash=SenhaComHash("hash-opaco"),
    )

    assert usuario.email == Email.de_texto("fulano@x.com")
    assert usuario.senha_hash == SenhaComHash("hash-opaco")
    assert usuario.tem_credenciais is True


def test_usuario_so_com_email_nao_tem_credenciais():
    assert Usuario("Fulano", email=Email.de_texto("f@x.com")).tem_credenciais is False
