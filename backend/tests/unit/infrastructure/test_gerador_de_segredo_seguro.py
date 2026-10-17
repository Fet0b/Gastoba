import re

from gastoba.domain.segredo_de_acesso import SegredoDeAcesso, TipoDeSegredo
from gastoba.infrastructure.seguranca.gerador_de_segredo_seguro import GeradorDeSegredoSeguro


def test_gerar_devolve_texto_url_safe_com_ao_menos_32_caracteres():
    segredo = GeradorDeSegredoSeguro().gerar()

    assert re.fullmatch(r"[A-Za-z0-9_-]{32,}", segredo)


def test_gerar_nao_se_repete():
    gerador = GeradorDeSegredoSeguro()

    assert len({gerador.gerar() for _ in range(100)}) == 100


def test_gerar_prefixo_devolve_8_letras_ou_digitos():
    gerador = GeradorDeSegredoSeguro()

    prefixos = {gerador.gerar_prefixo() for _ in range(100)}

    assert all(re.fullmatch(r"[A-Za-z0-9]{8}", p) for p in prefixos)
    assert len(prefixos) > 90


def test_formatos_do_domain_aceitam_o_que_o_gerador_produz():
    gerador = GeradorDeSegredoSeguro()

    sessao = SegredoDeAcesso.de_sessao(gerador.gerar())
    prefixo = gerador.gerar_prefixo()
    chave = SegredoDeAcesso.de_chave_de_api(prefixo, gerador.gerar())

    assert sessao.tipo is TipoDeSegredo.SESSAO
    assert sessao.valor.startswith("gsess_")
    assert chave.tipo is TipoDeSegredo.CHAVE_DE_API
    assert chave.prefixo_publico == prefixo
    assert chave.valor.startswith(f"gapi_{prefixo}_")
