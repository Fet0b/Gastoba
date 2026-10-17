import pytest

from gastoba.application.autenticacao import (
    Autenticacao,
    MeioDeAutenticacao,
    exigir_escopo,
    exigir_sessao,
)
from gastoba.domain.chave_de_api import EscopoDaChave
from gastoba.domain.excecoes import AcessoNegado
from gastoba.domain.usuario import Usuario

USUARIO = Usuario("Ana")
POR_SESSAO = Autenticacao(USUARIO, MeioDeAutenticacao.SESSAO)
POR_CHAVE_DE_LEITURA = Autenticacao(USUARIO, MeioDeAutenticacao.CHAVE_DE_API, EscopoDaChave.LEITURA)
POR_CHAVE_DE_ESCRITA = Autenticacao(USUARIO, MeioDeAutenticacao.CHAVE_DE_API, EscopoDaChave.ESCRITA)


@pytest.mark.parametrize("escopo", list(EscopoDaChave))
def test_sessao_tem_todos_os_escopos(escopo):
    exigir_escopo(POR_SESSAO, escopo)


def test_chave_de_leitura_le_mas_nao_escreve():
    exigir_escopo(POR_CHAVE_DE_LEITURA, EscopoDaChave.LEITURA)

    with pytest.raises(AcessoNegado):
        exigir_escopo(POR_CHAVE_DE_LEITURA, EscopoDaChave.ESCRITA)


@pytest.mark.parametrize("escopo", list(EscopoDaChave))
def test_chave_de_escrita_le_e_escreve(escopo):
    exigir_escopo(POR_CHAVE_DE_ESCRITA, escopo)


def test_exigir_sessao_aceita_sessao():
    exigir_sessao(POR_SESSAO)


@pytest.mark.parametrize("autenticacao", [POR_CHAVE_DE_LEITURA, POR_CHAVE_DE_ESCRITA])
def test_chave_de_api_nao_passa_onde_se_exige_sessao(autenticacao):
    with pytest.raises(AcessoNegado):
        exigir_sessao(autenticacao)


def test_autenticacao_por_chave_exige_escopo_e_por_sessao_nao_tem_escopo():
    with pytest.raises(ValueError):
        Autenticacao(USUARIO, MeioDeAutenticacao.CHAVE_DE_API)
    with pytest.raises(ValueError):
        Autenticacao(USUARIO, MeioDeAutenticacao.SESSAO, EscopoDaChave.LEITURA)
