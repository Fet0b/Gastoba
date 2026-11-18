from datetime import date
from uuid import UUID

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import PeriodoInvalido
from gastoba.domain.mes import Mes
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.revisao_contabil import RevisaoMensalContabil, diagnosticar_mes


class DiagnosticarContabilidade:
    """Compara as regras por competência sem reclassificar nem alterar dados financeiros."""

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self, usuario_id: UUID, inicio: date, fim: date
    ) -> tuple[RevisaoMensalContabil, ...]:
        if inicio > fim:
            raise PeriodoInvalido("O início deve ser anterior ou igual ao fim.")
        with self._unidade_de_trabalho as uow:
            movimentos = uow.movimentos_de_investimento.listar(usuario_id, inicio, fim)
            transferencias = uow.transferencias.listar(usuario_id, inicio, fim)
            gastos_legados = uow.gastos.listar(
                usuario_id, inicio, fim, categoria=CategoriaDoGasto.INVESTIMENTOS
            )
            meses = sorted(
                {Mes.de_data(m.data) for m in movimentos}
                | {Mes.de_data(t.data) for t in transferencias}
                | {Mes.de_data(g.data) for g in gastos_legados}
            )
            resultado = []
            for mes in meses:
                desde, ate = max(inicio, mes.inicio), min(fim, mes.fim)
                aportes = uow.movimentos_de_investimento.somar_aportes(usuario_id, desde, ate)
                por_categoria = uow.movimentos_de_investimento.somar_aportes_por_categoria(
                    usuario_id, desde, ate
                )
                partes = uow.destinacoes.somar_partes_por_categoria(usuario_id, desde, ate)
                gastos = uow.gastos.somar_por_categoria(usuario_id, desde, ate)
                anterior = aportes - Dinheiro(sum(v.centavos for v in partes.values()))
                anterior += gastos.get(CategoriaDoGasto.INVESTIMENTOS, Dinheiro(0))
                confirmado = Dinheiro(
                    sum(t.aporte_liquido.centavos for t in transferencias if desde <= t.data <= ate)
                )
                totais = {
                    categoria: por_categoria.get(categoria, Dinheiro(0))
                    + partes.get(categoria, Dinheiro(0))
                    for categoria in CategoriaDoGasto.ativas()
                }
                resultado.append(
                    diagnosticar_mes(
                        mes,
                        [m for m in movimentos if desde <= m.data <= ate],
                        anterior,
                        confirmado,
                        totais,
                        desde == mes.inicio and ate == mes.fim,
                    )
                )
            return tuple(resultado)
