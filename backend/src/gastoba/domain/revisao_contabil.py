from collections.abc import Sequence
from dataclasses import dataclass

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.mes import Mes
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    OrigemDoMovimento,
    TipoDeMovimento,
)
from gastoba.domain.natureza_do_movimento import tipo_sugerido


@dataclass(frozen=True, slots=True)
class ImpactoContabilDaCategoria:
    categoria: CategoriaDoGasto
    diferenca: Dinheiro


@dataclass(frozen=True, slots=True)
class RevisaoMensalContabil:
    mes: Mes
    periodo_completo: bool
    classificacoes_pendentes: int
    aportes_categorizados: int
    custos_como_aporte: int
    regra_anterior_liberdade_financeira: Dinheiro
    aporte_liquido_confirmado: Dinheiro
    categorias: tuple[ImpactoContabilDaCategoria, ...]

    @property
    def diferenca_liberdade_financeira(self) -> Dinheiro:
        return self.aporte_liquido_confirmado - self.regra_anterior_liberdade_financeira

    @property
    def afetado(self) -> bool:
        return bool(
            self.classificacoes_pendentes
            or self.diferenca_liberdade_financeira.centavos
            or any(i.diferenca.centavos for i in self.categorias)
        )


def diagnosticar_mes(
    mes: Mes,
    movimentos: Sequence[MovimentoDeInvestimento],
    regra_anterior: Dinheiro,
    confirmado: Dinheiro,
    categorias_antes: dict[CategoriaDoGasto, Dinheiro],
    periodo_completo: bool,
) -> RevisaoMensalContabil:
    financeiros = [m for m in movimentos if m.origem != OrigemDoMovimento.SALDO_INICIAL]
    aportes = [m for m in financeiros if m.tipo == TipoDeMovimento.APORTE]
    pendentes = sum(
        m.revisao_contabil_pendente
        or m.categoria is not None
        or (
            m.tipo == TipoDeMovimento.APORTE
            and tipo_sugerido(m.descricao) in (TipoDeMovimento.CUSTO, TipoDeMovimento.IMPOSTO)
        )
        for m in financeiros
    )
    return RevisaoMensalContabil(
        mes=mes,
        periodo_completo=periodo_completo,
        classificacoes_pendentes=pendentes,
        aportes_categorizados=sum(m.categoria is not None for m in aportes),
        custos_como_aporte=sum(
            tipo_sugerido(m.descricao) in (TipoDeMovimento.CUSTO, TipoDeMovimento.IMPOSTO)
            for m in aportes
        ),
        regra_anterior_liberdade_financeira=regra_anterior,
        aporte_liquido_confirmado=confirmado,
        categorias=tuple(
            ImpactoContabilDaCategoria(categoria, Dinheiro(-valor.centavos))
            for categoria, valor in sorted(categorias_antes.items(), key=lambda item: item[0].value)
            if valor.centavos
        ),
    )
