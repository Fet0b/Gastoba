// Módulo puro (sem React nem fetch): fluxo de aportes e resgates das posições no período,
// para separar a variação do saldo do rendimento. Tudo em BigInt de centavos.

import type { MovimentoDeInvestimento, PontoDoHistorico } from "../api/tipos";
import { deCentavos, paraCentavos } from "../dinheiro/dinheiro";

/**
 * Aportes menos resgates com data depois de `inicio` e até `fim`, em reais ("70.00"). `inicio` é
 * o dia do primeiro saldo da série: o que é dele ou anterior já está no saldo de partida.
 *
 * O saldo inicial não sai de conta, então só conta como dinheiro novo quando a posição não tinha
 * nenhum saldo guardado até `inicio` (apareceu no período) **e** não há aporte ligado a uma operação
 * da corretora (Revisão da bolsa) na posição no período: nesse caso o aporte ligado já é o dinheiro
 * novo e o saldo inicial seria contado em dobro. Com `investimentoId`, só aquele.
 */
export function fluxoLiquido(
  movimentos: readonly MovimentoDeInvestimento[],
  pontos: readonly PontoDoHistorico[],
  inicio: string,
  fim: string,
  investimentoId?: string,
): string {
  const existiaNoInicio = new Set(
    pontos.filter((ponto) => ponto.data <= inicio).map((ponto) => ponto.investimento_id),
  );
  const comAporteLigado = new Set(
    movimentos
      .filter((m) => m.tipo === "aporte" && m.casamento_id && m.data > inicio && m.data <= fim)
      .map((m) => m.investimento_id),
  );
  let total = 0n;
  for (const m of movimentos) {
    if (m.tipo !== "aporte" && m.tipo !== "resgate") continue;
    if (m.data <= inicio || m.data > fim) continue;
    if (investimentoId !== undefined && m.investimento_id !== investimentoId) continue;
    if (m.origem === "saldo_inicial" && m.investimento_id !== null && (existiaNoInicio.has(m.investimento_id) || comAporteLigado.has(m.investimento_id))) {
      continue;
    }
    const valor = paraCentavos(m.valor);
    total += m.tipo === "aporte" ? valor : -valor;
  }
  return deCentavos(total);
}
