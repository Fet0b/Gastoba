from datetime import UTC, datetime, timedelta

from gastoba.infrastructure.relogio_do_sistema import RelogioDoSistema


def test_agora_tem_fuso_utc_e_e_o_instante_atual():
    antes = datetime.now(UTC)

    agora = RelogioDoSistema().agora()

    assert agora.tzinfo is not None
    assert agora.utcoffset() == timedelta(0)
    assert antes <= agora <= datetime.now(UTC)
