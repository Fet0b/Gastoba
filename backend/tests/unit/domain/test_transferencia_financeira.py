from datetime import date
from uuid import uuid4

import pytest

from gastoba.domain.conta import PapelDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import TransacaoImportadaInvalida
from gastoba.domain.transferencia_entre_contas import TransferenciaEntreContas


@pytest.mark.parametrize(
    "origem,destino,esperado",
    [
        ("corrente", "investimento", 30000),
        ("investimento", "corrente", -30000),
        ("corrente", "corrente", 0),
        ("investimento", "investimento", 0),
    ],
)
def test_so_cruzar_fronteira_da_carteira_conta_dinheiro_novo(origem, destino, esperado):
    t = TransferenciaEntreContas(
        uuid4(),
        uuid4(),
        uuid4(),
        Dinheiro(30000),
        date(2026, 11, 4),
        PapelDaConta(origem),
        PapelDaConta(destino),
        transacao_origem_id=uuid4(),
    )
    assert t.aporte_liquido == Dinheiro(esperado)
    t.ativa = False
    assert t.aporte_liquido == Dinheiro(0)


def test_transferencia_exige_contas_distintas_e_pelo_menos_uma_ponta():
    conta = uuid4()
    with pytest.raises(TransacaoImportadaInvalida):
        TransferenciaEntreContas(
            uuid4(),
            conta,
            conta,
            Dinheiro(30000),
            date(2026, 11, 4),
            PapelDaConta.CORRENTE,
            PapelDaConta.INVESTIMENTO,
            transacao_origem_id=uuid4(),
        )
    with pytest.raises(TransacaoImportadaInvalida):
        TransferenciaEntreContas(
            uuid4(),
            uuid4(),
            uuid4(),
            Dinheiro(30000),
            date(2026, 11, 4),
            PapelDaConta.CORRENTE,
            PapelDaConta.INVESTIMENTO,
        )


def test_resultado_da_venda_deduz_custos_e_soma_rendimentos():
    from gastoba.domain.investimento import apurar_resultado_realizado

    assert apurar_resultado_realizado(
        [(Dinheiro(100000), Dinheiro(80000))], Dinheiro(500), Dinheiro(1000)
    ) == Dinheiro(20500)
