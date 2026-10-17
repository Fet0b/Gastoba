from datetime import timedelta
from uuid import uuid4

import pytest

from gastoba.application.criar_chave_de_api import CriarChaveDeApi
from gastoba.domain.chave_de_api import EscopoDaChave
from gastoba.domain.excecoes import ExpiracaoInvalida, NomeDeChaveInvalido
from gastoba.domain.segredo_de_acesso import TipoDeSegredo

USUARIO_ID = uuid4()


@pytest.fixture
def criar(unidade_de_trabalho, gerador, relogio):
    return CriarChaveDeApi(unidade_de_trabalho, gerador, relogio)


def test_cria_chave_e_devolve_o_segredo_em_claro_uma_unica_vez(criar, unidade_de_trabalho, relogio):
    criada = criar.executar(USUARIO_ID, nome=" Planilha ", escopo=EscopoDaChave.LEITURA)

    assert criada.segredo.tipo is TipoDeSegredo.CHAVE_DE_API
    assert criada.segredo.prefixo_publico == criada.chave.prefixo
    assert criada.chave.usuario_id == USUARIO_ID
    assert criada.chave.nome == "Planilha"
    assert criada.chave.escopo is EscopoDaChave.LEITURA
    assert criada.chave.criada_em == relogio.agora()
    assert criada.chave.expira_em is None
    assert criada.chave.ultimo_uso is None
    assert unidade_de_trabalho.commits == 1
    gravada = unidade_de_trabalho.confirmado.chaves_de_api[criada.chave.id]
    assert gravada.hash_do_segredo == criada.segredo.hash_sha256
    assert criada.segredo.valor not in repr(gravada)


def test_chave_com_expiracao_futura(criar, unidade_de_trabalho, relogio):
    expira_em = relogio.agora() + timedelta(days=30)

    criada = criar.executar(
        USUARIO_ID, nome="Script", escopo=EscopoDaChave.ESCRITA, expira_em=expira_em
    )

    assert unidade_de_trabalho.confirmado.chaves_de_api[criada.chave.id].expira_em == expira_em


@pytest.mark.parametrize("deslocamento", [timedelta(0), timedelta(seconds=-1)])
def test_expiracao_no_passado_ou_agora_e_recusada(
    criar, unidade_de_trabalho, relogio, deslocamento
):
    with pytest.raises(ExpiracaoInvalida):
        criar.executar(
            USUARIO_ID,
            nome="Script",
            escopo=EscopoDaChave.LEITURA,
            expira_em=relogio.agora() + deslocamento,
        )

    assert unidade_de_trabalho.confirmado.chaves_de_api == {}


@pytest.mark.parametrize("nome", ["", "  ", "a" * 61])
def test_nome_invalido_nao_grava(criar, unidade_de_trabalho, nome):
    with pytest.raises(NomeDeChaveInvalido):
        criar.executar(USUARIO_ID, nome=nome, escopo=EscopoDaChave.LEITURA)

    assert unidade_de_trabalho.confirmado.chaves_de_api == {}
    assert unidade_de_trabalho.commits == 0


def test_duas_chaves_tem_segredos_diferentes(criar):
    primeira = criar.executar(USUARIO_ID, nome="A", escopo=EscopoDaChave.LEITURA)
    segunda = criar.executar(USUARIO_ID, nome="A", escopo=EscopoDaChave.LEITURA)

    assert primeira.segredo != segunda.segredo
    assert primeira.chave.id != segunda.chave.id
