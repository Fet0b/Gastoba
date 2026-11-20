from datetime import UTC, datetime
from uuid import uuid4

import pytest

from gastoba.domain.excecoes import ErroDeDominio
from gastoba.domain.historico_de_meta import HistoricoDeMeta
from gastoba.domain.meta import AlvoDaMeta


@pytest.mark.parametrize(
    "anterior,novo,acao", [(None, 19, "criada"), (19, 20, "alterada"), (20, None, "removida")]
)
def test_registro_coerente(anterior, novo, acao):
    r = HistoricoDeMeta(
        uuid4(), AlvoDaMeta.LAZER, anterior, novo, acao, datetime(2026, 11, 9, tzinfo=UTC)
    )
    assert r.percentual_anterior == anterior
    assert r.percentual_novo == novo


@pytest.mark.parametrize(
    "anterior,novo,acao",
    [
        (None, None, "criada"),
        (20, 19, "criada"),
        (19, 19, "alterada"),
        (None, 19, "alterada"),
        (19, 20, "removida"),
        (0, None, "removida"),
        (None, 101, "criada"),
        (None, True, "criada"),
        (None, 20, "invalida"),
    ],
)
def test_rejeita_historico_incoerente(anterior, novo, acao):
    with pytest.raises(ErroDeDominio):
        HistoricoDeMeta(
            uuid4(), AlvoDaMeta.LAZER, anterior, novo, acao, datetime(2026, 11, 9, tzinfo=UTC)
        )
