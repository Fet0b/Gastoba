import type { Investimento } from "../api/tipos";
import { paraCentavos } from "../dinheiro/dinheiro";
import { aplicadoERendimento } from "./rentabilidade";

export type OrdenacaoDosInvestimentos = "saldo" | "rendimento" | "vencimento";

export function ordenarInvestimentos(investimentos: readonly Investimento[], ordem: OrdenacaoDosInvestimentos): Investimento[] {
  return [...investimentos].sort((a, b) => {
    if (ordem === "vencimento") {
      if (!a.vencimento) return b.vencimento ? 1 : 0;
      if (!b.vencimento) return -1;
      return a.vencimento.localeCompare(b.vencimento);
    }
    const esquerda = ordem === "saldo" ? a.saldo : aplicadoERendimento(a).rendimento;
    const direita = ordem === "saldo" ? b.saldo : aplicadoERendimento(b).rendimento;
    if (esquerda === null) return direita === null ? 0 : 1;
    if (direita === null) return -1;
    const valorA = paraCentavos(esquerda), valorB = paraCentavos(direita);
    return valorA > valorB ? -1 : valorA < valorB ? 1 : 0;
  });
}
