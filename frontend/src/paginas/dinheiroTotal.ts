import type { Conta } from "../api/tipos";
import { somar } from "../dinheiro/dinheiro";

/** O dinheiro total: a soma só das contas correntes; os cartões de crédito não entram. */
export function dinheiroTotalDasContas(contas: readonly Conta[] | undefined): string | undefined {
  return contas && somar(contas.filter((conta) => conta.tipo === "corrente").map((conta) => conta.saldo));
}
