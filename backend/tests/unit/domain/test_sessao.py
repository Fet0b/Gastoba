from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from gastoba.domain.excecoes import ExpiracaoInvalida
from gastoba.domain.sessao import Sessao

AGORA = datetime(2026, 10, 12, 12, 0, tzinfo=UTC)
HASH = "a" * 64


def _sessao(**campos) -> Sessao:
    padrao = {
        "usuario_id": uuid4(),
        "hash_do_segredo": HASH,
        "criada_em": AGORA,
        "expira_em": AGORA + timedelta(hours=12),
    }
    return Sessao(**(padrao | campos))


def test_sessao_nova_esta_ativa_ate_a_expiracao():
    sessao = _sessao()

    assert sessao.revogada is False
    assert sessao.esta_ativa(AGORA)
    assert sessao.esta_ativa(AGORA + timedelta(hours=12) - timedelta(microseconds=1))


def test_sessao_expirada_nao_esta_ativa_a_partir_do_instante_de_expiracao():
    sessao = _sessao()

    assert not sessao.esta_ativa(AGORA + timedelta(hours=12))
    assert not sessao.esta_ativa(AGORA + timedelta(days=1))


def test_sessao_revogada_nao_esta_ativa():
    sessao = _sessao()
    sessao.revogar()

    assert sessao.revogada is True
    assert not sessao.esta_ativa(AGORA)


@pytest.mark.parametrize("expira_em", [AGORA, AGORA - timedelta(seconds=1)])
def test_expiracao_precisa_ser_depois_da_criacao(expira_em):
    with pytest.raises(ExpiracaoInvalida):
        _sessao(expira_em=expira_em)


@pytest.mark.parametrize("hash_do_segredo", ["", "a" * 63, "A" * 64, "g" * 64])
def test_hash_do_segredo_precisa_ser_sha256_hexadecimal_minusculo(hash_do_segredo):
    with pytest.raises(ValueError):
        _sessao(hash_do_segredo=hash_do_segredo)


def test_sessoes_com_mesmo_id_sao_iguais():
    sessao = _sessao()

    assert sessao == _sessao(id=sessao.id)
    assert hash(sessao) == hash(_sessao(id=sessao.id))
    assert sessao != _sessao()


def test_repr_nao_mostra_o_hash_do_segredo():
    assert HASH not in repr(_sessao())


def test_expiracao_sem_fuso_horario_e_recusada():
    with pytest.raises(ExpiracaoInvalida):
        _sessao(expira_em=datetime(2026, 10, 13, 12, 0))


def test_criacao_sem_fuso_horario_e_recusada():
    with pytest.raises(ValueError):
        _sessao(criada_em=datetime(2026, 10, 12, 12, 0))
