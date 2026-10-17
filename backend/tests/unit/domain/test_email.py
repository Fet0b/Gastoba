import pytest

from gastoba.domain.email import Email
from gastoba.domain.excecoes import EmailInvalido


def test_de_texto_remove_espacos_das_pontas_e_poe_em_minusculas():
    assert Email.de_texto("  Ana.Silva@Exemplo.COM ").valor == "ana.silva@exemplo.com"


def test_emails_normalizados_iguais_sao_iguais():
    assert Email.de_texto("ANA@x.com") == Email.de_texto(" ana@x.com")


def test_str_devolve_o_endereco():
    assert str(Email.de_texto("ana@x.com")) == "ana@x.com"


@pytest.mark.parametrize(
    "texto",
    [
        "",
        "   ",
        "ana",
        "ana.x.com",
        "ana@@x.com",
        "ana@x@y.com",
        "@x.com",
        "ana@",
        "a@",
        "ana silva@x.com",
        "ana@x\t.com",
        "ana@x\x00.com",
    ],
)
def test_email_sem_exatamente_um_arroba_com_partes_vazias_ou_com_espaco_e_invalido(texto):
    with pytest.raises(EmailInvalido):
        Email.de_texto(texto)


def test_tamanho_minimo_e_tres_caracteres():
    assert Email.de_texto("a@b").valor == "a@b"


def test_email_com_254_caracteres_e_valido_e_com_255_e_invalido():
    dominio = "@x.com"
    assert len(Email.de_texto("a" * (254 - len(dominio)) + dominio).valor) == 254
    with pytest.raises(EmailInvalido):
        Email.de_texto("a" * (255 - len(dominio)) + dominio)


def test_tamanho_conta_depois_de_remover_os_espacos_das_pontas():
    dominio = "@x.com"
    assert Email.de_texto("  " + "a" * (254 - len(dominio)) + dominio + "  ")


def test_construtor_direto_exige_valor_normalizado():
    with pytest.raises(EmailInvalido):
        Email("Ana@x.com")


def test_mensagem_de_erro_nao_ecoa_o_valor_enviado():
    with pytest.raises(EmailInvalido) as erro:
        Email.de_texto("segredo-sem-arroba")

    assert "segredo-sem-arroba" not in str(erro.value)


def test_email_com_acentos_e_normalizado_em_minusculas():
    assert Email.de_texto(" JOÃO@Exemplo.com.BR ").valor == "joão@exemplo.com.br"


@pytest.mark.parametrize("invisivel", ["​", " ", " ", "﻿"])
def test_caracteres_invisiveis_no_meio_sao_recusados(invisivel):
    with pytest.raises(EmailInvalido):
        Email.de_texto(f"ana{invisivel}@x.com")


def test_tamanho_conta_caracteres_e_nao_bytes():
    dominio = "@x.com"
    assert len(Email.de_texto("ç" * (254 - len(dominio)) + dominio).valor) == 254


def test_emails_iguais_tem_o_mesmo_hash():
    assert len({Email.de_texto("Ana@x.com"), Email.de_texto("ana@x.com ")}) == 1
