// Módulo puro: a agenda das recorrências mensais. "Hoje" é sempre argumento;
// datas são texto "AAAA-MM-DD" ou componentes numéricos, e o dinheiro é BigInt.

import type { Recorrencia } from "../api/tipos";
import { deCentavos, paraCentavos } from "../dinheiro/dinheiro";

export const DIAS_DA_AGENDA = 30;

export type Lancamento = {
  recorrencia: Recorrencia;
  /** "AAAA-MM-DD". */
  data: string;
  /** Dias de hoje até a data (1 é amanhã). */
  diasAte: number;
};

const doisDigitos = (n: number) => String(n).padStart(2, "0");

function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

function ordinalDoDia(data: string): number {
  const [ano, mes, dia] = data.split("-").map(Number);
  return Date.UTC(ano, mes - 1, dia) / 86_400_000;
}

function vigente(recorrencia: Recorrencia, hoje: string): boolean {
  return recorrencia.ativa && (recorrencia.fim === null || recorrencia.fim >= hoje);
}

/**
 * A próxima data da recorrência, estritamente depois de hoje, dentro de
 * `inicio` e `fim` (inclusivos); em mês curto vale o último dia. Nulo se
 * encerrada ou se o fim vem antes da próxima data.
 */
export function proximaOcorrencia(recorrencia: Recorrencia, hoje: string): string | null {
  if (!recorrencia.ativa) return null;
  const base = recorrencia.inicio > hoje ? recorrencia.inicio : hoje;
  let ano = Number(base.slice(0, 4));
  let mes = Number(base.slice(5, 7));
  // No máximo o mês-base e o seguinte já bastam; o laço é só uma folga.
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    const dia = Math.min(recorrencia.dia_do_mes, diasNoMes(ano, mes));
    const data = `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
    if (data > hoje && data >= recorrencia.inicio) {
      return recorrencia.fim !== null && data > recorrencia.fim ? null : data;
    }
    if (mes === 12) {
      ano += 1;
      mes = 1;
    } else {
      mes += 1;
    }
  }
  return null;
}

/** As próximas datas das recorrências vigentes, em até `dias` dias, por data e descrição. */
export function proximosLancamentos(
  recorrencias: readonly Recorrencia[],
  hoje: string,
  dias = DIAS_DA_AGENDA,
): Lancamento[] {
  const base = ordinalDoDia(hoje);
  const lista: Lancamento[] = [];
  for (const recorrencia of recorrencias) {
    if (!vigente(recorrencia, hoje)) continue;
    const data = proximaOcorrencia(recorrencia, hoje);
    if (data === null) continue;
    const diasAte = ordinalDoDia(data) - base;
    if (diasAte <= dias) lista.push({ recorrencia, data, diasAte });
  }
  return lista.sort(
    (a, b) =>
      a.data.localeCompare(b.data) || a.recorrencia.descricao.localeCompare(b.recorrencia.descricao, "pt-BR"),
  );
}

export type Comprometido = { ganhos: string; gastos: string; saldo: string };

/** O que as recorrências vigentes movimentam por mês: ganhos, gastos e a diferença. */
export function comprometidoPorMes(
  recorrencias: readonly Recorrencia[],
  hoje: string,
): Comprometido {
  let ganhos = 0n;
  let gastos = 0n;
  for (const recorrencia of recorrencias) {
    if (!vigente(recorrencia, hoje)) continue;
    if (recorrencia.tipo === "ganho") ganhos += paraCentavos(recorrencia.valor);
    else gastos += paraCentavos(recorrencia.valor);
  }
  return { ganhos: deCentavos(ganhos), gastos: deCentavos(gastos), saldo: deCentavos(ganhos - gastos) };
}
