from datetime import date
from uuid import uuid4

from gastoba.domain.caixinha import reconciliar_extrato_mensal
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento


def test_reconcilia_extrato_mensal_sem_inventar_rendimento():
    conta, investimento = uuid4(), uuid4()

    def m(tipo, valor):
        return MovimentoDeInvestimento(
            conta, tipo, Dinheiro(valor), "Extrato fictício", date(2026, 11, 4), investimento
        )

    movimentos = [m(TipoDeMovimento.APORTE, v) for v in (142100, 14313, 95645)]
    movimentos += [m(TipoDeMovimento.RESGATE, v) for v in (100000, 60000)]
    movimentos += [m(TipoDeMovimento.RENDIMENTO, 4159)]
    resultado = reconciliar_extrato_mensal(Dinheiro(0), Dinheiro(96217), movimentos, True)
    assert resultado.saldo_calculado == Dinheiro(96217)
    assert resultado.diferenca == Dinheiro(0) and resultado.conciliado
    divergente = reconciliar_extrato_mensal(Dinheiro(0), Dinheiro(96218), movimentos, True)
    assert divergente.diferenca == Dinheiro(1) and not divergente.conciliado
    incompleto = reconciliar_extrato_mensal(Dinheiro(0), Dinheiro(96217), movimentos, False)
    assert not incompleto.conciliado
