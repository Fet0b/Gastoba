// A linha do tempo única de Transações: gastos e ganhos juntos, agrupados por dia.
// Módulo puro; dinheiro só em BigInt de centavos (Art. III).

import type { Ganho, Gasto } from "../api/tipos";
import { deCentavos, paraCentavos } from "../dinheiro/dinheiro";

export type TransacaoDaLinha =
  | ({ tipo: "gasto" } & Gasto)
  | ({ tipo: "ganho" } & Ganho);

export type GrupoDoDia = { data: string; transacoes: TransacaoDaLinha[] };

export const TAMANHO_DA_PAGINA = 100;

/** Une gastos e ganhos: data mais recente primeiro e, no mesmo dia, saídas antes de entradas. */
export function juntarTransacoes(gastos: readonly Gasto[], ganhos: readonly Ganho[]): TransacaoDaLinha[] {
  const todas: TransacaoDaLinha[] = [
    ...gastos.map((g): TransacaoDaLinha => ({ ...g, tipo: "gasto" })),
    ...ganhos.map((g): TransacaoDaLinha => ({ ...g, tipo: "ganho" })),
  ];
  // `sort` é estável: itens iguais mantêm a ordem em que chegaram.
  return todas.sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? 1 : -1;
    if (a.tipo !== b.tipo) return a.tipo === "gasto" ? -1 : 1;
    return 0;
  });
}

/** Agrupa por dia mantendo a ordem recebida. */
export function agruparPorDia(transacoes: readonly TransacaoDaLinha[]): GrupoDoDia[] {
  const grupos: GrupoDoDia[] = [];
  for (const transacao of transacoes) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.data === transacao.data) ultimo.transacoes.push(transacao);
    else grupos.push({ data: transacao.data, transacoes: [transacao] });
  }
  return grupos;
}

/** Minúsculas, sem acentos e com os espaços colapsados, para comparar na busca. */
export function normalizarParaBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Mantém as transações em que todos os termos aparecem na descrição ou nas tags. */
export function filtrarPorBusca(
  transacoes: readonly TransacaoDaLinha[],
  busca: string,
): TransacaoDaLinha[] {
  const termos = normalizarParaBusca(busca).split(" ").filter(Boolean);
  if (termos.length === 0) return [...transacoes];
  return transacoes.filter((transacao) => {
    const alvo = normalizarParaBusca([transacao.descricao, ...transacao.tags].join(" "));
    return termos.every((termo) => alvo.includes(termo));
  });
}

/** Total de entradas, de saídas e o saldo (entradas menos saídas). */
export function totaisDasTransacoes(transacoes: readonly TransacaoDaLinha[]): {
  entradas: string;
  saidas: string;
  saldo: string;
} {
  let entradas = 0n;
  let saidas = 0n;
  for (const transacao of transacoes) {
    const valor = paraCentavos(transacao.valor);
    if (transacao.tipo === "ganho") entradas += valor;
    else saidas += valor;
  }
  return { entradas: deCentavos(entradas), saidas: deCentavos(saidas), saldo: deCentavos(entradas - saidas) };
}

/** As primeiras `paginas * tamanho` linhas e quantas ficaram de fora. */
export function fatiaDaPagina<T>(
  itens: readonly T[],
  paginas = 1,
  tamanho = TAMANHO_DA_PAGINA,
): { itens: T[]; restantes: number } {
  const limite = Math.max(0, paginas) * tamanho;
  return { itens: itens.slice(0, limite), restantes: Math.max(0, itens.length - limite) };
}
