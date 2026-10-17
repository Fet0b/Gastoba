import pytest

from gastoba.domain.excecoes import SenhaInvalida
from gastoba.domain.senha import SenhaComHash, SenhaEmClaro


@pytest.mark.parametrize("tamanho", [10, 128])
def test_senha_com_10_a_128_caracteres_e_valida(tamanho):
    assert SenhaEmClaro("s" * tamanho).valor == "s" * tamanho


@pytest.mark.parametrize("tamanho", [0, 9, 129])
def test_senha_com_menos_de_10_ou_mais_de_128_caracteres_e_invalida(tamanho):
    with pytest.raises(SenhaInvalida):
        SenhaEmClaro("s" * tamanho)


def test_senha_nao_e_normalizada():
    assert SenhaEmClaro("  Com Espaco  ").valor == "  Com Espaco  "


def test_tamanho_conta_caracteres_e_nao_bytes():
    assert SenhaEmClaro("ç" * 128).valor == "ç" * 128


def test_repr_e_str_nunca_mostram_a_senha():
    senha = SenhaEmClaro("minha-senha-secreta")

    assert "minha-senha-secreta" not in repr(senha)
    assert "minha-senha-secreta" not in str(senha)
    assert "minha-senha-secreta" not in f"{senha}"


def test_mensagem_de_erro_nao_ecoa_a_senha():
    with pytest.raises(SenhaInvalida) as erro:
        SenhaEmClaro("curta123")

    assert "curta123" not in str(erro.value)


def test_senha_com_hash_guarda_texto_opaco():
    assert SenhaComHash("scrypt$abc$def").valor == "scrypt$abc$def"


def test_senha_com_hash_vazia_e_rejeitada():
    with pytest.raises(ValueError):
        SenhaComHash("")


def test_repr_da_senha_com_hash_nao_mostra_o_hash():
    assert "scrypt$abc$def" not in repr(SenhaComHash("scrypt$abc$def"))
    assert "scrypt$abc$def" not in str(SenhaComHash("scrypt$abc$def"))


def test_129_caracteres_unicode_e_invalido():
    with pytest.raises(SenhaInvalida):
        SenhaEmClaro("ç" * 129)


def test_senha_com_emoji_conta_cada_caractere_uma_vez():
    assert SenhaEmClaro("🔑" * 10).valor == "🔑" * 10
    with pytest.raises(SenhaInvalida):
        SenhaEmClaro("🔑" * 9)


def test_igualdade_e_hash_pelo_valor():
    assert SenhaEmClaro("senha-certa") == SenhaEmClaro("senha-certa")
    assert SenhaEmClaro("senha-certa") != SenhaEmClaro("Senha-certa")
    assert len({SenhaComHash("h1"), SenhaComHash("h1"), SenhaComHash("h2")}) == 2
