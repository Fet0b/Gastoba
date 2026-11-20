// Módulo puro: a evolução do saldo a partir dos saldos diários guardados. Todo o dinheiro é BigInt
// de centavos; as datas são texto "AAAA-MM-DD" ou componentes numéricos.

import type { PontoDoHistorico } from "../api/tipos";
import { deCentavos, paraCentavos } from "../dinheiro/dinheiro";

export type PontoDaEvolucao = { data: string; saldo: string };

/**
 * A série do saldo, um ponto por dia em que algum investimento foi registrado. Com
 * `investimentoId`, só aquele investimento; sem ele, a soma de todos. Quando um investimento não
 * tem registro num dia, vale o último saldo que ele teve antes (o saldo não some entre registros).
 */
export function montarSerie(
  pontos: readonly PontoDoHistorico[],
  investimentoId?: string,
): PontoDaEvolucao[] {
  const escolhidos = investimentoId
    ? pontos.filter((ponto) => ponto.investimento_id === investimentoId)
    : pontos;
  const datas = [...new Set(escolhidos.map((ponto) => ponto.data))].sort();
  const ultimo = new Map<string, bigint>();
  const porData = new Map<string, PontoDoHistorico[]>();
  for (const ponto of escolhidos) porData.set(ponto.data, [...(porData.get(ponto.data) ?? []), ponto]);
  return datas.map((data) => {
    for (const ponto of porData.get(data) ?? []) {
      ultimo.set(ponto.investimento_id, paraCentavos(ponto.saldo));
    }
    let total = 0n;
    for (const saldo of ultimo.values()) total += saldo;
    return { data, saldo: deCentavos(total) };
  });
}

/** Quanto o saldo variou do primeiro ao último ponto, em reais com sinal; `null` com menos de 2. */
export function variacao(serie: readonly PontoDaEvolucao[]): string | null {
  if (serie.length < 2) return null;
  return deCentavos(paraCentavos(serie[serie.length - 1].saldo) - paraCentavos(serie[0].saldo));
}

export type Janela = "30dias" | "90dias" | "1ano";

export const JANELAS: readonly { janela: Janela; rotulo: string; dias: number }[] = [
  { janela: "30dias", rotulo: "30 dias", dias: 30 },
  { janela: "90dias", rotulo: "90 dias", dias: 90 },
  { janela: "1ano", rotulo: "1 ano", dias: 365 },
];

function texto(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${String(data.getDate()).padStart(2, "0")}`;
}

/** O período da janela terminando em `hoje` ("AAAA-MM-DD"), com início e fim inclusivos. */
export function periodoDaJanela(janela: Janela, hoje: string): { inicio: string; fim: string } {
  const [ano, mes, dia] = hoje.split("-").map(Number);
  const dias = JANELAS.find((item) => item.janela === janela)?.dias ?? 30;
  return { inicio: texto(new Date(ano, mes - 1, dia - (dias - 1))), fim: hoje };
}

export type PontoNoGrafico = PontoDaEvolucao & {
  /** Posição no quadro (0 a `largura`, 0 a `altura`; y cresce para baixo). */
  x: number;
  y: number;
};

/**
 * Posiciona a série num quadro `largura` x `altura` com uma folga de `margem`. A altura é relativa
 * ao menor e ao maior saldo, calculada em BigInt (milionésimos); com um só valor, a linha fica no
 * meio. Com um ponto só, ele fica no meio do eixo x.
 */
export function pontosDoGrafico(
  serie: readonly PontoDaEvolucao[],
  largura: number,
  altura: number,
  margem: number,
): PontoNoGrafico[] {
  if (serie.length === 0) return [];
  const saldos = serie.map((ponto) => paraCentavos(ponto.saldo));
  const minimo = saldos.reduce((a, b) => (b < a ? b : a));
  const maximo = saldos.reduce((a, b) => (b > a ? b : a));
  const amplitude = maximo - minimo;
  const util = { x: largura - 2 * margem, y: altura - 2 * margem };
  return serie.map((ponto, indice) => {
    const fracaoX = serie.length === 1 ? 0.5 : indice / (serie.length - 1);
    const fracaoY =
      amplitude === 0n ? 0.5 : Number(((saldos[indice] - minimo) * 1_000_000n) / amplitude) / 1_000_000;
    return {
      ...ponto,
      x: Math.round((margem + fracaoX * util.x) * 100) / 100,
      y: Math.round((margem + (1 - fracaoY) * util.y) * 100) / 100,
    };
  });
}
