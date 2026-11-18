// Módulo puro (sem React nem fetch) das destinações de um aporte: a mesma regra do backend
// (percentuais inteiros somando 100; o resto da divisão vai de 1 em 1 centavo para a primeira).

import type { CorDaDestinacao, Investimento } from "../api/tipos";
import { deCentavos, paraCentavos } from "../dinheiro/dinheiro";
import { CORES_DA_PIZZA } from "../graficos/pizza";
import { corDaDestinacao } from "../cores/mapaDeCores";
import { normalizarTag, validarTag } from "../tags/tags";

/** Uma linha do editor: a tag como digitada e o percentual como digitado. */
export type LinhaDeDestinacao = { tag: string; percentual: string };

export const MENSAGEM_SOMA_DAS_DESTINACOES = "Os percentuais precisam somar 100%.";

/** O percentual digitado como inteiro de 1 a 100, ou `null` se não for. */
export function lerPercentual(texto: string): number | null {
  if (!/^\d{1,3}$/.test(texto.trim())) return null;
  const valor = Number(texto.trim());
  return valor >= 1 && valor <= 100 ? valor : null;
}

/** A soma dos percentuais válidos das linhas (os inválidos contam zero). */
export function somaDosPercentuais(linhas: readonly LinhaDeDestinacao[]): number {
  return linhas.reduce((total, linha) => total + (lerPercentual(linha.percentual) ?? 0), 0);
}

/**
 * Por que as linhas ainda não podem ser enviadas, ou `null` se estão certas: ao menos uma, cada
 * tag válida e sem repetição, cada percentual de 1 a 100 e a soma 100.
 */
export function motivoDasDestinacoes(linhas: readonly LinhaDeDestinacao[]): string | null {
  if (linhas.length === 0) return "Informe ao menos uma destinação.";
  const vistas = new Set<string>();
  for (const linha of linhas) {
    const tag = normalizarTag(linha.tag);
    const erroDaTag = validarTag(tag);
    if (erroDaTag !== null) return erroDaTag;
    if (vistas.has(tag)) return "Cada tag só pode aparecer uma vez.";
    vistas.add(tag);
    if (lerPercentual(linha.percentual) === null) {
      return "Cada percentual deve ser um inteiro de 1 a 100.";
    }
  }
  return somaDosPercentuais(linhas) === 100 ? null : MENSAGEM_SOMA_DAS_DESTINACOES;
}

/** As linhas prontas para a API (tag normalizada, percentual inteiro). */
export function destinacoesParaEnvio(
  linhas: readonly LinhaDeDestinacao[],
): { tag: string; percentual: number }[] {
  return linhas.map((linha) => ({
    tag: normalizarTag(linha.tag),
    percentual: lerPercentual(linha.percentual) ?? 0,
  }));
}

/**
 * O valor de cada linha, em centavos inteiros, somando exatamente `valor`. Com linhas inválidas ou
 * soma diferente de 100, devolve lista vazia (não há o que mostrar).
 */
export function dividirPorPercentuais(
  valor: string,
  linhas: readonly LinhaDeDestinacao[],
): string[] {
  if (motivoDasDestinacoes(linhas) !== null) return [];
  return dividirCentavos(
    paraCentavos(valor),
    linhas.map((linha) => lerPercentual(linha.percentual) ?? 0),
  ).map(deCentavos);
}

/** Divide `total` (centavos) pelos percentuais; o resto vai de 1 em 1 centavo da primeira em diante. */
function dividirCentavos(total: bigint, percentuais: readonly number[]): bigint[] {
  const partes = percentuais.map((percentual) => (total * BigInt(percentual)) / 100n);
  let resto = total - partes.reduce((soma, parte) => soma + parte, 0n);
  for (let posicao = 0; resto > 0n; posicao += 1, resto -= 1n) partes[posicao] += 1n;
  return partes;
}

/**
 * O valor de cada linha para mostrar enquanto a pessoa digita: a divisão exata quando está pronta
 * e, antes disso, o valor provisório (truncado ao centavo) das linhas com percentual válido;
 * `null` nas demais.
 */
export function valoresEmAndamento(
  valor: string,
  linhas: readonly LinhaDeDestinacao[],
): (string | null)[] {
  const total = paraCentavos(valor);
  const percentuais = linhas.map((linha) => lerPercentual(linha.percentual));
  if (
    linhas.length > 0 &&
    percentuais.every((p) => p !== null) &&
    somaDosPercentuais(linhas) === 100
  ) {
    return dividirCentavos(total, percentuais as number[]).map(deCentavos);
  }
  return linhas.map((linha) => {
    const percentual = lerPercentual(linha.percentual);
    return percentual === null ? null : deCentavos((total * BigInt(percentual)) / 100n);
  });
}

export type RestanteDaDistribuicao = {
  situacao: "falta" | "completa" | "excede";
  /** |100 − soma|, inteiro ≥ 0. */
  percentual: number;
  /** Em reais, truncado ao centavo; nulo sem valor a dividir. */
  valor: string | null;
};

/** Quanto falta (ou passa) para os percentuais fecharem 100%, em % e em reais. */
export function restanteDaDistribuicao(
  valor: string | undefined,
  linhas: readonly LinhaDeDestinacao[],
): RestanteDaDistribuicao {
  const diferenca = 100 - somaDosPercentuais(linhas);
  const percentual = Math.abs(diferenca);
  return {
    situacao: diferenca > 0 ? "falta" : diferenca < 0 ? "excede" : "completa",
    percentual,
    valor:
      valor === undefined ? null : deCentavos((paraCentavos(valor) * BigInt(percentual)) / 100n),
  };
}

/**
 * Move a linha `posicao` para `novo` (limitado a 1..100-(n-1)) e redistribui o resto entre as
 * outras: cada uma fica com ao menos 1 e o que sobra é proporcional ao percentual atual (inválido
 * pesa 0; todos 0, pesos iguais), por maiores restos, empate para o menor índice.
 */
export function redistribuirPercentuais(
  linhas: readonly LinhaDeDestinacao[],
  posicao: number,
  novo: number,
): LinhaDeDestinacao[] {
  const n = linhas.length;
  if (n <= 1) return linhas.map((l) => ({ ...l, percentual: String(Math.min(100, Math.max(1, novo))) }));
  const valor = Math.min(100 - (n - 1), Math.max(1, Math.round(novo)));
  const outras = linhas.map((_, i) => i).filter((i) => i !== posicao);
  const livre = 100 - valor - outras.length;
  let pesos = outras.map((i) => lerPercentual(linhas[i].percentual) ?? 0);
  if (pesos.every((p) => p === 0)) pesos = pesos.map(() => 1);
  const somaDosPesos = pesos.reduce((a, b) => a + b, 0);
  const partes = pesos.map((p) => Math.floor((livre * p) / somaDosPesos));
  let sobra = livre - partes.reduce((a, b) => a + b, 0);
  const ordem = pesos
    .map((p, k) => ({ k, resto: (livre * p) % somaDosPesos }))
    .sort((a, b) => b.resto - a.resto || a.k - b.k);
  for (const { k } of ordem) {
    if (sobra <= 0) break;
    partes[k] += 1;
    sobra -= 1;
  }
  return linhas.map((linha, i) => {
    if (i === posicao) return { ...linha, percentual: String(valor) };
    return { ...linha, percentual: String(1 + partes[outras.indexOf(i)]) };
  });
}

/** Cor (hex) de cada linha: a salva da tag; senão a da paleta da pizza pela posição. */
export function coresDasLinhas(
  linhas: readonly LinhaDeDestinacao[],
  investimentos: readonly Investimento[] | undefined,
): string[] {
  const salvas = new Map<string, CorDaDestinacao>();
  for (const investimento of investimentos ?? []) {
    for (const destinacao of investimento.destinacoes) {
      if (destinacao.tag !== null && destinacao.cor !== null && !salvas.has(normalizarTag(destinacao.tag))) {
        salvas.set(normalizarTag(destinacao.tag), destinacao.cor);
      }
    }
  }
  return linhas.map((linha, indice) => {
    const tag = normalizarTag(linha.tag);
    return tag ? corDaDestinacao(tag, salvas.get(tag) ?? null) : CORES_DA_PIZZA[indice % CORES_DA_PIZZA.length];
  });
}

const SINAL_DE_MENOS = "\u{2212}";

/** A rentabilidade da API ("4.32", "-3.33") escrita para a tela ("+4,32%", "−3,33%"); "–" se nula. */
export function rotuloDaRentabilidade(texto: string | null): string {
  if (texto === null) return "\u{2013}";
  const negativo = texto.startsWith("-");
  const numero = (negativo ? texto.slice(1) : texto).replace(".", ",");
  const zero = /^0(,0+)?$/.test(numero);
  return `${negativo ? SINAL_DE_MENOS : zero ? "" : "+"}${numero}%`;
}
