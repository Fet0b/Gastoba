import type { Conta, SituacaoDaFatura } from "../api/tipos";
import { deCentavos, paraCentavos } from "../dinheiro/dinheiro";

export type ResumoDoSaldo = {
  rotulo: "Saldo" | "Fatura aberta" | "Fatura fechada" | "Saldo a favor";
  valor: string;
  tom: "neutro" | "negativo";
  saldoNegativo: boolean;
};

/**
 * Como mostrar o saldo de uma conta: a corrente mostra o saldo (negativo em destaque); o cartão
 * mostra o valor devido, positivo e neutro, como "Fatura aberta" (também quando não se conhece a
 * situação) ou "Fatura fechada" (a mais recente já fechou, paga ou não), ou, com crédito a favor,
 * o saldo a favor. A cobrança vencida é destacada à parte, pelo selo "Vencida".
 */
export function resumoDoSaldo(
  conta: Pick<Conta, "tipo" | "saldo">,
  situacaoDaFatura?: SituacaoDaFatura,
): ResumoDoSaldo {
  const centavos = paraCentavos(conta.saldo);
  if (conta.tipo === "cartao") {
    if (centavos > 0n) {
      return { rotulo: "Saldo a favor", valor: conta.saldo, tom: "neutro", saldoNegativo: false };
    }
    const rotulo = situacaoDaFatura === undefined || situacaoDaFatura === "aberta" ? "Fatura aberta" : "Fatura fechada";
    return { rotulo, valor: deCentavos(-centavos), tom: "neutro", saldoNegativo: false };
  }
  const negativo = centavos < 0n;
  return {
    rotulo: "Saldo",
    valor: conta.saldo,
    tom: negativo ? "negativo" : "neutro",
    saldoNegativo: negativo,
  };
}
