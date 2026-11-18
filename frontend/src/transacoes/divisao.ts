// Módulo puro (sem React nem fetch): a divisão de uma transação em partes por porcentagem, com a
// mesma regra do backend (2 a 10 partes de 1 a 100%, soma 100; o resto da divisão vai de 1 em 1
// centavo para a primeira parte; parte com zero centavo é descartada). Na saída, a parte com a
// marca `como_investimento` é um aporte: sem tags, com o investimento e as destinações opcionais.

import type { ParteDaDivisao } from "../api/tipos";
import { deCentavos, paraCentavos } from "../dinheiro/dinheiro";
import {
  destinacoesParaEnvio,
  lerPercentual,
  type LinhaDeDestinacao,
  motivoDasDestinacoes,
  valoresEmAndamento,
} from "../investimentos/destinacoes";
import { normalizarTag, validarTag } from "../tags/tags";

export const MINIMO_DE_PARTES = 2;
export const MAXIMO_DE_PARTES = 10;


/**
 * Uma linha do editor: categoria escolhida, tags como digitadas (separadas por vírgula) e %. Na
 * parte de aporte, o investimento escolhido (vazio é "escolher depois") e as destinações.
 */
export type LinhaDaDivisao = {
  categoria: string;
  como_investimento?: boolean;
  tags: string;
  percentual: string;
  /** Só da tela: a unidade em que a pessoa digita o valor da parte (padrão: porcentagem). */
  modo?: "percentual" | "reais";
  /** Só da tela: o valor em reais como digitado (com máscara), no modo `reais`. */
  reais?: string;
  investimentoId?: string;
  destinacoes?: readonly LinhaDeDestinacao[];
};

/** A parte é um aporte apenas pelo marcador explícito e só na saída. */
export function ehAporte(linha: LinhaDaDivisao, saida: boolean): boolean {
  return saida && linha.como_investimento === true;
}

/** As tags digitadas (separadas por vírgula), normalizadas, sem vazias nem repetidas. */
export function lerTags(texto: string): string[] {
  const vistas = new Set<string>();
  for (const pedaco of texto.split(",")) {
    const tag = normalizarTag(pedaco);
    if (tag !== "") vistas.add(tag);
  }
  return [...vistas];
}

export function somaDosPercentuaisDaDivisao(linhas: readonly LinhaDaDivisao[]): number {
  return linhas.reduce((total, linha) => total + (lerPercentual(linha.percentual) ?? 0), 0);
}

/**
 * Por que a divisão ainda não pode ser enviada, ou `null` se está certa. Na saída cada parte
 * precisa de categoria; na entrada nenhuma tem.
 */
export function motivoDaDivisao(linhas: readonly LinhaDaDivisao[], saida: boolean): string | null {
  if (linhas.length < MINIMO_DE_PARTES) return `Divida em pelo menos ${MINIMO_DE_PARTES} partes.`;
  if (linhas.length > MAXIMO_DE_PARTES) return `No máximo ${MAXIMO_DE_PARTES} partes.`;
  for (const linha of linhas) {
    if (saida && !ehAporte(linha,saida) && linha.categoria === "") return "Escolha a categoria de cada parte.";
    if (lerPercentual(linha.percentual) === null) {
      return "Cada percentual deve ser um inteiro de 1 a 100.";
    }
    if (ehAporte(linha, saida)) {
      // O aporte não tem tags; com investimento escolhido, as destinações precisam valer.
      if ((linha.investimentoId ?? "") === "") continue;
      const motivo = motivoDasDestinacoes(linha.destinacoes ?? []);
      if (motivo !== null) return motivo;
      continue;
    }
    const tags = lerTags(linha.tags);
    for (const tag of tags) {
      const problema = validarTag(tag);
      if (problema !== null) return problema;
    }
  }
  return somaDosPercentuaisDaDivisao(linhas) === 100 ? null : "Os percentuais precisam somar 100%.";
}

/** O valor de cada linha em centavos inteiros, somando `valor`; vazio se a divisão é inválida. */
export function valoresDaDivisao(
  valor: string,
  linhas: readonly LinhaDaDivisao[],
  saida: boolean,
): string[] {
  if (motivoDaDivisao(linhas, saida) !== null) return [];
  const total = paraCentavos(valor);
  const partes = linhas.map((linha) => (total * BigInt(lerPercentual(linha.percentual) ?? 0)) / 100n);
  let resto = total - partes.reduce((soma, parte) => soma + parte, 0n);
  for (let posicao = 0; resto > 0n; posicao += 1, resto -= 1n) partes[posicao] += 1n;
  return partes.map(deCentavos);
}

/** As linhas prontas para a API. */
export function partesParaEnvio(linhas: readonly LinhaDaDivisao[], saida: boolean): ParteDaDivisao[] {
  return linhas.map((linha) => {
    const percentual = lerPercentual(linha.percentual) ?? 0;
    if (ehAporte(linha, saida)) {
      const investimentoId = linha.investimentoId ?? "";
      return {
        como_investimento:true,
        tags: [],
        percentual,
        ...(investimentoId === ""
          ? {}
          : {
              investimento_id: investimentoId,
              destinacoes: destinacoesParaEnvio(linha.destinacoes ?? []),
            }),
      };
    }
    return {
      ...(saida ? { categoria: linha.categoria } : {}),
      tags: lerTags(linha.tags),
      percentual,
    };
  });
}

const comoDestinacoes = (linhas: readonly LinhaDaDivisao[]): LinhaDeDestinacao[] =>
  linhas.map((linha) => ({ tag: "", percentual: linha.percentual }));

/**
 * O valor de cada parte enquanto a pessoa ainda edita (nulo para percentual inválido). Com a soma
 * 100 é o mesmo da API: o resto de centavos vai de 1 em 1 para a primeira parte; com outra soma,
 * cada parte é só truncada ao centavo.
 */
export function valoresEmAndamentoDaDivisao(
  valor: string,
  linhas: readonly LinhaDaDivisao[],
): (string | null)[] {
  return valoresEmAndamento(valor, comoDestinacoes(linhas));
}

export type RestanteDaDivisao = {
  situacao: "falta" | "completa" | "passou";
  /** Quanto das partes válidas já está distribuído, em reais (truncado ao centavo). */
  distribuido: string;
  /** |valor − distribuído|, em reais. */
  diferenca: string;
};

/** Quanto do valor já está distribuído e quanto falta ou passa para fechar 100%. */
export function restanteDaDivisao(valor: string, linhas: readonly LinhaDaDivisao[]): RestanteDaDivisao {
  const total = paraCentavos(valor);
  const soma = somaDosPercentuaisDaDivisao(linhas);
  const distribuido = soma === 100 ? total : (total * BigInt(soma)) / 100n;
  const diferenca = total >= distribuido ? total - distribuido : distribuido - total;
  return {
    situacao: soma === 100 ? "completa" : soma < 100 ? "falta" : "passou",
    distribuido: deCentavos(distribuido),
    diferenca: deCentavos(diferenca),
  };
}

/** Todas as partes com o mesmo peso: inteiros que somam 100, com o resto para as primeiras. */
export function dividirIgualmente(linhas: readonly LinhaDaDivisao[]): LinhaDaDivisao[] {
  const base = Math.floor(100 / linhas.length);
  const resto = 100 - base * linhas.length;
  return linhas.map((linha, posicao) => ({
    ...linha,
    percentual: String(base + (posicao < resto ? 1 : 0)),
    modo: "percentual",
    reais: undefined,
  }));
}

/**
 * Dá à parte `posicao` o que falta para as outras fecharem 100%. Sem efeito (a mesma lista) quando
 * o que falta não cabe em 1 a 100.
 */
export function completarComORestante(
  linhas: readonly LinhaDaDivisao[],
  posicao: number,
): readonly LinhaDaDivisao[] {
  const dasOutras = linhas.reduce(
    (total, linha, i) => (i === posicao ? total : total + (lerPercentual(linha.percentual) ?? 0)),
    0,
  );
  const falta = 100 - dasOutras;
  if (falta < 1 || falta > 100) return linhas;
  return linhas.map((linha, i) =>
    i === posicao ? { ...linha, percentual: String(falta), modo: "percentual", reais: undefined } : linha,
  );
}

/**
 * A porcentagem inteira mais próxima de `valor` dentro de `total` (de 1 a 100), para quem digita
 * em reais: a API só aceita porcentagens inteiras, então o que vale é esse inteiro.
 */
export function percentualDoValor(valor: string, total: string): number | null {
  const centavos = paraCentavos(valor);
  const base = paraCentavos(total);
  if (centavos <= 0n || base <= 0n) return null;
  const arredondado = (centavos * 200n + base) / (2n * base);
  return Number(arredondado < 1n ? 1n : arredondado > 100n ? 100n : arredondado);
}

export type ErrosDaParte = {
  categoria?: string;
  percentual?: string;
  tags?: string;
};

/** O que há de errado em cada campo de cada parte, em frases curtas para mostrar junto ao campo. */
export function errosDasPartes(linhas: readonly LinhaDaDivisao[], saida: boolean): ErrosDaParte[] {
  return linhas.map((linha) => {
    const erros: ErrosDaParte = {};
    const aporte = ehAporte(linha, saida);
    if (saida && !aporte && linha.categoria === "") erros.categoria = "Escolha a categoria";
    if (lerPercentual(linha.percentual) === null) erros.percentual = "Informe de 1 a 100";
    if (!aporte) {
      for (const tag of lerTags(linha.tags)) {
        const problema = validarTag(tag);
        if (problema !== null) {
          erros.tags = problema;
          break;
        }
      }
    }
    return erros;
  });
}
