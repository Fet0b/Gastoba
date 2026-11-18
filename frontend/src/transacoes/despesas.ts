import type { Gasto, MovimentoDeInvestimento } from "../api/tipos";
import { deCentavos, paraCentavos } from "../dinheiro/dinheiro";
export type Despesa = {
  data: string;
  valor: string;
  categoria: string;
  origem: "gasto" | "aporte";
  id: string;
};
export function valorLiquido(gasto: Pick<Gasto, "valor" | "valor_coberto">): string {
  return deCentavos(paraCentavos(gasto.valor) - paraCentavos(gasto.valor_coberto));
}

/** Aporte nunca é despesa, inclusive quando contém uma categoria histórica. */
export function fatiasDoAporte(movimento: Pick<MovimentoDeInvestimento, "valor" | "categoria" | "destinacoes">): { categoria: string | null; valor: string }[] {
  return [{ categoria: null, valor: movimento.valor }];
}

export function despesasDoPeriodo(gastos: readonly Gasto[], _movimentos: readonly MovimentoDeInvestimento[]): Despesa[] {
  return [
    ...gastos.filter(g => paraCentavos(valorLiquido(g)) > 0n).map((g): Despesa => ({ id: g.id, data: g.data, valor: valorLiquido(g), categoria: g.categoria, origem: "gasto" })),

  ];
}
