// Módulo puro: prepara as barras horizontais do resumo por tags. Reaproveita o
// agrupamento de `fatias.ts`; a conta de frações é toda em BigInt.

import type { FatiaPorTag, Gasto, ResumoPorTags } from "../api/tipos";
import { paraCentavos } from "../dinheiro/dinheiro";
import { gastosDaBarra } from "./detalheDaBarra";
import { agruparFatias, fracaoDe, rotuloDoPercentual, type TipoDeFatia } from "./fatias";

export const MAXIMO_DE_TAGS_NAS_BARRAS = 8;
/** Fração mínima de uma barra sobre a maior, para existir visualmente (o piso de 2 px). */
export const FRACAO_MINIMA_DA_BARRA = 0.01;

/** Chave de "Sem tag" (a marca nunca é uma tag válida, que só tem caracteres imprimíveis). */
export const CHAVE_SEM_TAG = "\u{0}sem_tag";
/** Chave de "Outras" (com a marca, para nunca colidir com uma tag chamada "outras"). */
export const CHAVE_DE_OUTRAS = "\u{0}outras";

/** Uma tag agrupada em "Outras (N tags)". */
export type Membro = {
  tag: string;
  valor: string;
  fracaoDoTotal: number;
  percentual: string;
  /** Número de gastos do mês com a tag, quando a lista de gastos foi dada. */
  quantidade?: number;
};

export type Barra = {
  /** O que fixa a barra: a tag, `CHAVE_SEM_TAG` ou `CHAVE_DE_OUTRAS`. */
  chave: string;
  tipo: TipoDeFatia;
  rotulo: string;
  valor: string;
  /** Largura relativa à maior barra (0 a 1), com o piso. */
  fracaoDaMaior: number;
  /** Parte do total (0 a 1). */
  fracaoDoTotal: number;
  /** Percentual do total escrito ("40%", "<1%"). */
  percentual: string;
  /** Número de gastos do mês na barra, quando a lista de gastos foi dada. */
  quantidade?: number;
  /** Só em "Outras": as tags agrupadas, da maior para a menor. */
  membros?: Membro[];
};

function chaveDe(tipo: TipoDeFatia, rotulo: string): string {
  return tipo === "sem_tag" ? CHAVE_SEM_TAG : tipo === "outras" ? CHAVE_DE_OUTRAS : rotulo;
}

/**
 * As barras do resumo. Com a lista de gastos do mês (opcional), cada barra e cada
 * tag de "Outras" ganham a `quantidade` de gastos.
 */
export function prepararBarras(
  resumo: ResumoPorTags,
  maximoDeTags = MAXIMO_DE_TAGS_NAS_BARRAS,
  gastos?: readonly Gasto[],
): Barra[] {
  if (resumo.fatias.length === 0 || paraCentavos(resumo.total) === 0n) return [];
  // A API já ordena, mas a ordem por valor é garantida aqui (estável nos empates);
  // `agruparFatias` mantém "Sem tag" por último.
  const ordenadas = [...resumo.fatias].sort((a, b) => {
    const diferenca = paraCentavos(b.valor) - paraCentavos(a.valor);
    return diferenca > 0n ? 1 : diferenca < 0n ? -1 : 0;
  });
  const grupos = agruparFatias(ordenadas, maximoDeTags);
  const maior = grupos.reduce(
    (m, grupo) => (paraCentavos(grupo.valor) > paraCentavos(m) ? grupo.valor : m),
    grupos[0].valor,
  );
  const mostradas = new Set(grupos.filter((g) => g.tipo === "tag").map((g) => g.rotulo));
  const agrupadas = ordenadas.filter((fatia) => fatia.tag !== null && !mostradas.has(fatia.tag));
  const membrosDe = (fatias: readonly FatiaPorTag[]): Membro[] =>
    fatias.map((fatia) => {
      const tag = fatia.tag as string;
      const fracaoDoTotal = fracaoDe(fatia.valor, resumo.total);
      const membro: Membro = {
        tag,
        valor: fatia.valor,
        fracaoDoTotal,
        percentual: rotuloDoPercentual(fracaoDoTotal),
      };
      if (gastos) membro.quantidade = gastosDaBarra({ tipo: "tag", rotulo: tag }, gastos).length;
      return membro;
    });

  return grupos.map((grupo) => {
    const fracaoDoTotal = fracaoDe(grupo.valor, resumo.total);
    const proporcao = fracaoDe(grupo.valor, maior);
    const membros = grupo.tipo === "outras" ? membrosDe(agrupadas) : undefined;
    const barra: Barra = {
      chave: chaveDe(grupo.tipo, grupo.rotulo),
      tipo: grupo.tipo,
      rotulo: grupo.rotulo,
      valor: grupo.valor,
      fracaoDaMaior: Math.max(proporcao, FRACAO_MINIMA_DA_BARRA),
      fracaoDoTotal,
      percentual: rotuloDoPercentual(fracaoDoTotal),
    };
    if (membros) barra.membros = membros;
    if (gastos) barra.quantidade = gastosDaBarra({ ...barra, membros }, gastos).length;
    return barra;
  });
}

/**
 * A barra de uma chave, ou, para uma tag que está dentro de "Outras", uma barra
 * montada com os dados dela. `undefined` se a chave não existe neste resumo.
 */
export function barraPelaChave(barras: readonly Barra[], chave: string | null): Barra | undefined {
  if (chave === null) return undefined;
  const achada = barras.find((barra) => barra.chave === chave);
  if (achada) return achada;
  for (const barra of barras) {
    const membro = barra.membros?.find((m) => m.tag === chave);
    if (membro) {
      return {
        chave,
        tipo: "tag",
        rotulo: membro.tag,
        valor: membro.valor,
        fracaoDaMaior: 0,
        fracaoDoTotal: membro.fracaoDoTotal,
        percentual: membro.percentual,
        quantidade: membro.quantidade,
      };
    }
  }
  return undefined;
}
