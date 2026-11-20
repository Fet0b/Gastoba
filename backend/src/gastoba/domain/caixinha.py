from collections.abc import Sequence
from dataclasses import dataclass
from uuid import UUID

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ValorInvalido
from gastoba.domain.mes import Mes
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento

TIPO_DA_CAIXINHA = "CAIXINHA"


@dataclass(frozen=True, slots=True)
class ReconciliacaoDaCaixinha:
    saldo_inicial: Dinheiro
    saldo_observado: Dinheiro
    saldo_calculado: Dinheiro
    completo: bool

    @property
    def diferenca(self) -> Dinheiro:
        return self.saldo_observado - self.saldo_calculado

    @property
    def conciliado(self) -> bool:
        return self.completo and self.diferenca.centavos == 0


def reconciliar_extrato_mensal(
    inicial: Dinheiro,
    final: Dinheiro,
    movimentos: Sequence[MovimentoDeInvestimento],
    completo: bool,
) -> ReconciliacaoDaCaixinha:
    saldo = inicial.centavos
    for m in movimentos:
        if m.origem.value == "saldo_inicial":
            continue
        sinal = 1 if m.tipo in (TipoDeMovimento.APORTE, TipoDeMovimento.RENDIMENTO) else -1
        saldo += sinal * m.valor.centavos
    return ReconciliacaoDaCaixinha(inicial, final, Dinheiro(saldo), completo)


@dataclass(frozen=True, slots=True)
class ReferenciaMensalDaCaixinha:
    investimento_id: UUID
    mes: Mes
    saldo_inicial: Dinheiro
    saldo_final: Dinheiro
    periodo_completo: bool

    def __post_init__(self) -> None:
        if self.saldo_inicial.centavos < 0 or self.saldo_final.centavos < 0:
            raise ValorInvalido("Os saldos do extrato não podem ser negativos.")


@dataclass(frozen=True, slots=True)
class EstimativaDaCaixinha:
    """O que fecha a caixinha: o saldo é do banco; o principal é o que o Gastoba registrou
    (aplicações menos resgates). A diferença é o rendimento acumulado."""

    saldo: Dinheiro
    principal: Dinheiro
    rendimento: Dinheiro

    @property
    def divergente(self) -> bool:
        """Rendimento negativo não existe numa conta remunerada: sobrou principal, ou seja, há
        resgate (ou rendimento reaplicado) que ainda não foi classificado."""
        return self.rendimento.centavos < 0


def reconciliar_caixinha(saldo: Dinheiro, principal: Dinheiro) -> EstimativaDaCaixinha:
    return EstimativaDaCaixinha(saldo, principal, saldo - principal)
