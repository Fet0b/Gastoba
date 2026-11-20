import type { SituacaoDaMeta } from "../api/tipos";

/** Os dois trechos do anel de uma meta, em pontos de 0 a 100 do círculo. */
export type ArcosDoAnel = { gasto: number; rachurado: number };

/**
 * O desenho do anel: o gasto vem primeiro (no máximo 100; zero sem renda, como o anel sempre
 * fez) e o guardado para comprar (`percentual_guardado` do servidor) fica logo depois, limitado
 * ao que falta para fechar o anel. Só desenho: o valor e o tamanho do guardado já vêm prontos.
 */
export function arcosDoAnel(
  usado: number | null,
  percentualGuardado: number,
  situacao?: SituacaoDaMeta,
): ArcosDoAnel {
  const gasto = situacao === "sem_renda" ? 0 : Math.min(Math.max(usado ?? 0, 0), 100);
  const rachurado = Math.min(Math.max(percentualGuardado, 0), 100 - gasto);
  return { gasto, rachurado };
}
