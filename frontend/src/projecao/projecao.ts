// Módulo puro: estimativa linear do gasto do mês. "Hoje" e o mês chegam como
// argumento (o relógio nunca é lido aqui) e a conta é toda em BigInt.

import type { Gasto } from "../api/tipos";
import { deCentavos, paraCentavos } from "../dinheiro/dinheiro";
import { limites, type Periodo } from "../periodo/periodo";

/** A projeção só aparece a partir deste dia do mês (antes disso há pouco dado). */
export const MINIMO_DE_DIAS = 3;

export type Projecao =
  | { tipo: "futuro" }
  | { tipo: "encerrado"; gasto: string }
  | { tipo: "poucos_dias"; gasto: string }
  | { tipo: "estimativa"; gasto: string; estimativa: string; dia: number; diasDoMes: number };

export type EntradaDaProjecao = {
  /** Os gastos conhecidos do mês; o que tem data depois de hoje fica fora da conta. */
  gastos: readonly Pick<Gasto, "valor" | "data">[];
  periodo: Periodo;
  /** "AAAA-MM-DD". */
  hoje: string;
};

function somaAte(
  gastos: EntradaDaProjecao["gastos"],
  inicio: string,
  fim: string,
): bigint {
  // Datas "AAAA-MM-DD" comparam certo como texto.
  return gastos
    .filter((gasto) => gasto.data >= inicio && gasto.data <= fim)
    .reduce((total, gasto) => total + paraCentavos(gasto.valor), 0n);
}

/** O gasto do mês conhecido até hoje (o que tem data depois de hoje fica fora; mês futuro dá zero). */
export function gastoAteHoje({ gastos, periodo, hoje }: EntradaDaProjecao): string {
  const { inicio, fim } = limites(periodo);
  return deCentavos(somaAte(gastos, inicio, hoje < fim ? hoje : fim));
}

export function projetarGastoDoMes({ gastos, periodo, hoje }: EntradaDaProjecao): Projecao {
  const { inicio, fim } = limites(periodo);
  if (hoje < inicio) return { tipo: "futuro" };
  if (hoje > fim) return { tipo: "encerrado", gasto: deCentavos(somaAte(gastos, inicio, fim)) };

  const gasto = somaAte(gastos, inicio, hoje);
  const dia = Number(hoje.slice(8, 10));
  const diasDoMes = Number(fim.slice(8, 10));
  if (dia < MINIMO_DE_DIAS) return { tipo: "poucos_dias", gasto: deCentavos(gasto) };
  const estimativa = (gasto * BigInt(diasDoMes)) / BigInt(dia);
  return {
    tipo: "estimativa",
    gasto: deCentavos(gasto),
    estimativa: deCentavos(estimativa),
    dia,
    diasDoMes,
  };
}
