// Módulo puro (sem React nem fetch) do gráfico por tags: agrupa as fatias do
// resumo e calcula frações com BigInt (nenhum Number sobre dinheiro).

import type { FatiaPorTag } from "../api/tipos";
import { paraCentavos } from "../dinheiro/dinheiro";

export type TipoDeFatia = "tag" | "outras" | "sem_tag";

export type FatiaAgrupada = {
  tipo: TipoDeFatia;
  /** O nome para a legenda: a tag, "Outras (N tags)" ou "Sem tag". */
  rotulo: string;
  valor: string;
};

export const MAXIMO_DE_TAGS_NA_PIZZA = 4;

function somar(fatias: readonly FatiaPorTag[]): bigint {
  return fatias.reduce((total, fatia) => total + paraCentavos(fatia.valor), 0n);
}

/**
 * Mantém as `maximoDeTags` maiores tags (a API já as devolve da maior para a
 * menor), soma o resto em "Outras (N tags)" e mantém "Sem tag" separada, no
 * fim: no máximo 6 fatias com o padrão.
 */
export function agruparFatias(
  fatias: readonly FatiaPorTag[],
  maximoDeTags = MAXIMO_DE_TAGS_NA_PIZZA,
): FatiaAgrupada[] {
  const comTag = fatias.filter((fatia) => fatia.tag !== null);
  const semTag = fatias.find((fatia) => fatia.tag === null);
  // Com uma tag a mais que o máximo, "Outras (1 tag)" não economiza nada: mostra a tag.
  const cabem = comTag.length <= maximoDeTags + 1 ? comTag.length : maximoDeTags;
  const grupos: FatiaAgrupada[] = comTag
    .slice(0, cabem)
    .map((fatia) => ({ tipo: "tag", rotulo: fatia.tag as string, valor: fatia.valor }));
  const resto = comTag.slice(cabem);
  if (resto.length > 0) {
    grupos.push({
      tipo: "outras",
      rotulo: `Outras (${resto.length} tags)`,
      valor: centavosParaTexto(somar(resto)),
    });
  }
  if (semTag) grupos.push({ tipo: "sem_tag", rotulo: "Sem tag", valor: semTag.valor });
  return grupos;
}

function centavosParaTexto(centavos: bigint): string {
  const reais = centavos / 100n;
  const resto = centavos % 100n;
  return `${reais}.${resto.toString().padStart(2, "0")}`;
}

/** A fração `valor / total` (0 a 1), calculada em milionésimos com BigInt; 0 se o total é zero. */
export function fracaoDe(valor: string, total: string): number {
  const divisor = paraCentavos(total);
  if (divisor === 0n) return 0;
  return Number((paraCentavos(valor) * 1_000_000n) / divisor) / 1_000_000;
}

/** O percentual inteiro da fração; "<1%" quando existe mas é menor que 1%. */
export function rotuloDoPercentual(fracao: number): string {
  if (fracao > 0 && fracao < 0.01) return "<1%";
  return `${Math.round(fracao * 100)}%`;
}
