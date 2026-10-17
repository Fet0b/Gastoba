from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from gastoba.domain.chave_de_api import ChaveDeApi, EscopoDaChave
from gastoba.domain.excecoes import ExpiracaoInvalida, NomeDeChaveInvalido

AGORA = datetime(2026, 10, 12, 12, 0, tzinfo=UTC)
HASH = "b" * 64


def _chave(**campos) -> ChaveDeApi:
    padrao = {
        "usuario_id": uuid4(),
        "nome": "Planilha",
        "prefixo": "Ab12Cd34",
        "hash_do_segredo": HASH,
        "escopo": EscopoDaChave.LEITURA,
        "criada_em": AGORA,
    }
    return ChaveDeApi(**(padrao | campos))


def test_chave_nova_sem_expiracao_fica_ativa_sem_limite_de_tempo():
    chave = _chave(nome="  Planilha  ")

    assert chave.nome == "Planilha"
    assert chave.ultimo_uso is None
    assert chave.expira_em is None
    assert chave.revogada is False
    assert chave.esta_ativa(AGORA + timedelta(days=3650))


@pytest.mark.parametrize("nome", ["", "   ", "a" * 61])
def test_nome_vazio_ou_com_mais_de_60_caracteres_e_invalido(nome):
    with pytest.raises(NomeDeChaveInvalido):
        _chave(nome=nome)


def test_nome_com_60_caracteres_e_valido():
    assert _chave(nome="a" * 60).nome == "a" * 60


@pytest.mark.parametrize("prefixo", ["", "Ab12Cd3", "Ab12Cd345", "Ab12_d34", "Ab12-d34"])
def test_prefixo_precisa_ter_8_caracteres_alfanumericos(prefixo):
    with pytest.raises(ValueError):
        _chave(prefixo=prefixo)


def test_hash_do_segredo_precisa_ser_sha256_hexadecimal():
    with pytest.raises(ValueError):
        _chave(hash_do_segredo="x")


def test_chave_com_expiracao_deixa_de_estar_ativa_no_instante_de_expiracao():
    chave = _chave(expira_em=AGORA + timedelta(days=1))

    assert chave.esta_ativa(AGORA + timedelta(days=1) - timedelta(microseconds=1))
    assert not chave.esta_ativa(AGORA + timedelta(days=1))


@pytest.mark.parametrize("expira_em", [AGORA, AGORA - timedelta(days=1)])
def test_expiracao_precisa_ser_depois_da_criacao(expira_em):
    with pytest.raises(ExpiracaoInvalida):
        _chave(expira_em=expira_em)


def test_chave_revogada_nao_esta_ativa():
    chave = _chave()
    chave.revogar()

    assert chave.revogada is True
    assert not chave.esta_ativa(AGORA)


def test_primeiro_uso_e_registrado():
    chave = _chave()

    assert chave.registrar_uso(AGORA) is True
    assert chave.ultimo_uso == AGORA


def test_uso_e_registrado_no_maximo_uma_vez_por_minuto():
    chave = _chave(ultimo_uso=AGORA)

    assert chave.registrar_uso(AGORA + timedelta(seconds=59)) is False
    assert chave.ultimo_uso == AGORA
    assert chave.registrar_uso(AGORA + timedelta(minutes=1)) is True
    assert chave.ultimo_uso == AGORA + timedelta(minutes=1)


def test_escopo_leitura_so_permite_leitura():
    chave = _chave(escopo=EscopoDaChave.LEITURA)

    assert chave.permite(EscopoDaChave.LEITURA)
    assert not chave.permite(EscopoDaChave.ESCRITA)


def test_escopo_escrita_permite_leitura_e_escrita():
    chave = _chave(escopo=EscopoDaChave.ESCRITA)

    assert chave.permite(EscopoDaChave.LEITURA)
    assert chave.permite(EscopoDaChave.ESCRITA)


def test_escopos_tem_codigos_estaveis():
    assert [e.value for e in EscopoDaChave] == ["leitura", "escrita"]


def test_chaves_com_mesmo_id_sao_iguais():
    chave = _chave()

    assert chave == _chave(id=chave.id)
    assert hash(chave) == hash(_chave(id=chave.id))
    assert chave != _chave()


def test_repr_nao_mostra_o_hash_do_segredo():
    assert HASH not in repr(_chave())


def test_expiracao_sem_fuso_horario_e_recusada():
    with pytest.raises(ExpiracaoInvalida):
        _chave(expira_em=datetime(2026, 10, 13, 12, 0))


@pytest.mark.parametrize("campo", ["criada_em", "ultimo_uso"])
def test_instantes_sem_fuso_horario_sao_recusados(campo):
    with pytest.raises(ValueError):
        _chave(**{campo: datetime(2026, 10, 12, 12, 0)})
