import hashlib

import pytest

from gastoba.domain.excecoes import NaoAutenticado
from gastoba.domain.segredo_de_acesso import (
    TAMANHO_MAXIMO_DO_SEGREDO,
    SegredoDeAcesso,
    TipoDeSegredo,
)

ALEATORIO = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0-_x"


def test_segredo_de_sessao_tem_prefixo_gsess():
    segredo = SegredoDeAcesso.de_sessao(ALEATORIO)

    assert segredo.valor == f"gsess_{ALEATORIO}"
    assert segredo.tipo is TipoDeSegredo.SESSAO
    assert segredo.prefixo_publico is None


def test_segredo_de_chave_tem_prefixo_gapi_e_prefixo_publico():
    segredo = SegredoDeAcesso.de_chave_de_api("Ab12Cd34", ALEATORIO)

    assert segredo.valor == f"gapi_Ab12Cd34_{ALEATORIO}"
    assert segredo.tipo is TipoDeSegredo.CHAVE_DE_API
    assert segredo.prefixo_publico == "Ab12Cd34"


def test_de_texto_reconhece_os_dois_tipos():
    assert SegredoDeAcesso.de_texto(f"gsess_{ALEATORIO}").tipo is TipoDeSegredo.SESSAO
    chave = SegredoDeAcesso.de_texto(f"gapi_Ab12Cd34_{ALEATORIO}")
    assert chave.tipo is TipoDeSegredo.CHAVE_DE_API
    assert chave.prefixo_publico == "Ab12Cd34"


def test_parte_aleatoria_da_chave_pode_ter_sublinhado():
    segredo = SegredoDeAcesso.de_texto(f"gapi_Ab12Cd34_{ALEATORIO}_mais")
    assert segredo.prefixo_publico == "Ab12Cd34"


@pytest.mark.parametrize(
    "texto",
    [
        "",
        "gsess_",
        "gsess_curto",
        f"gx_{ALEATORIO}",
        f"Bearer gsess_{ALEATORIO}",
        f"GSESS_{ALEATORIO}",
        f"gsess_{ALEATORIO} ",
        f"gsess_{ALEATORIO}=",
        f"gsess_{ALEATORIO}ç",
        "gsess_" + "a" * 257,
        f"gapi_{ALEATORIO}",
        f"gapi_Ab12Cd3_{ALEATORIO}",
        f"gapi_Ab12Cd345_{ALEATORIO}",
        f"gapi_Ab12-d34_{ALEATORIO}",
        "gapi_Ab12Cd34_",
        "gapi_Ab12Cd34_curto",
        f"token_{ALEATORIO}",
    ],
)
def test_token_malformado_ou_de_prefixo_desconhecido_nao_autentica(texto):
    with pytest.raises(NaoAutenticado):
        SegredoDeAcesso.de_texto(texto)


def test_parte_aleatoria_aceita_de_32_a_256_caracteres():
    assert SegredoDeAcesso.de_sessao("a" * 32)
    assert SegredoDeAcesso.de_sessao("a" * 256)
    with pytest.raises(NaoAutenticado):
        SegredoDeAcesso.de_sessao("a" * 31)


def test_hash_e_sha256_hexadecimal_do_texto_completo():
    segredo = SegredoDeAcesso.de_sessao(ALEATORIO)

    esperado = hashlib.sha256(f"gsess_{ALEATORIO}".encode()).hexdigest()
    assert segredo.hash_sha256 == esperado
    assert len(segredo.hash_sha256) == 64


def test_segredos_diferentes_tem_hashes_diferentes():
    assert (
        SegredoDeAcesso.de_sessao("a" * 32).hash_sha256
        != SegredoDeAcesso.de_sessao("b" * 32).hash_sha256
    )


def test_repr_e_str_nunca_mostram_o_segredo():
    segredo = SegredoDeAcesso.de_chave_de_api("Ab12Cd34", ALEATORIO)

    assert ALEATORIO not in repr(segredo)
    assert ALEATORIO not in str(segredo)


def test_mensagem_de_erro_nao_ecoa_o_token():
    with pytest.raises(NaoAutenticado) as erro:
        SegredoDeAcesso.de_texto("gsess_curto")

    assert "curto" not in str(erro.value)


@pytest.mark.parametrize("prefixo", ["gsess_", "gapi_Ab12Cd34_"])
def test_token_gigante_e_recusado_pelo_tamanho_antes_de_qualquer_hash(prefixo, monkeypatch):
    chamadas = []
    monkeypatch.setattr(hashlib, "sha256", lambda *args: chamadas.append(args))

    with pytest.raises(NaoAutenticado):
        SegredoDeAcesso.de_texto(prefixo + "a" * 1_000_000)

    assert chamadas == []


def test_token_no_tamanho_maximo_e_aceito_e_um_a_mais_e_recusado():
    maximo = f"gapi_Ab12Cd34_{'a' * 256}"
    assert len(maximo) == TAMANHO_MAXIMO_DO_SEGREDO
    assert SegredoDeAcesso.de_texto(maximo)
    with pytest.raises(NaoAutenticado):
        SegredoDeAcesso.de_texto(maximo + "a")


def test_digitos_unicode_nao_contam_como_alfanumericos():
    with pytest.raises(NaoAutenticado):
        SegredoDeAcesso.de_texto("gsess_" + "١" * 40)


def test_segredos_com_o_mesmo_valor_sao_iguais_e_tem_o_mesmo_hash():
    um = SegredoDeAcesso.de_sessao(ALEATORIO)
    outro = SegredoDeAcesso.de_texto(f"gsess_{ALEATORIO}")

    assert um == outro
    assert len({um, outro}) == 1
