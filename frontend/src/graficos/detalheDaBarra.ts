// Módulo puro: os gastos que formam uma barra do gráfico por tags. A parte de
// cada gasto repete a divisão do backend (`ResumoPorTags`): partes iguais entre
// as tags do gasto, em centavos, com o resto de 1 em 1 centavo a partir da primeira tag.

import type { Gasto } from "../api/tipos";
import { deCentavos, paraCentavos } from "../dinheiro/dinheiro";
import { normalizarTag } from "../tags/tags";
import type { TipoDeFatia } from "./fatias";

/** O que se precisa saber de uma barra (ou de uma tag dentro de "Outras") para listar seus gastos. */
export type AlvoDaBarra = {
  tipo: TipoDeFatia;
  rotulo: string;
  /** As tags agrupadas, só em "Outras". */
  membros?: readonly { tag: string }[];
};

export type GastoDaBarra = {
  /** O gasto inteiro, como veio da API. */
  gasto: Gasto;
  /** A parte do gasto que a barra conta (em string decimal). */
  parte: string;
};

function parteDaTag(gasto: Gasto, indice: number): bigint {
  const centavos = paraCentavos(gasto.valor);
  const quantidade = BigInt(gasto.tags.length);
  return centavos / quantidade + (BigInt(indice) < centavos % quantidade ? 1n : 0n);
}

/** Os gastos da barra, do mais recente ao mais antigo (estável nos empates), com a parte de cada um. */
export function gastosDaBarra(alvo: AlvoDaBarra, gastos: readonly Gasto[]): GastoDaBarra[] {
  const procuradas =
    alvo.tipo === "tag"
      ? new Set([normalizarTag(alvo.rotulo)])
      : alvo.tipo === "outras"
        ? new Set((alvo.membros ?? []).map((membro) => membro.tag))
        : null;

  const itens: GastoDaBarra[] = [];
  for (const gasto of gastos) {
    if (procuradas === null) {
      if (gasto.tags.length === 0) itens.push({ gasto, parte: gasto.valor });
      continue;
    }
    let parte = 0n;
    let achou = false;
    gasto.tags.forEach((tag, indice) => {
      if (!procuradas.has(tag)) return;
      achou = true;
      parte += parteDaTag(gasto, indice);
    });
    if (achou) itens.push({ gasto, parte: deCentavos(parte) });
  }
  return itens.sort((a, b) => (a.gasto.data < b.gasto.data ? 1 : a.gasto.data > b.gasto.data ? -1 : 0));
}
