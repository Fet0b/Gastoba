import type { CorDaDestinacao } from "../api/tipos";
import { HEX_DA_COR } from "../investimentos/cores";
export { corDaCategoria } from "../categorias/cores";

const PALETA = Object.values(HEX_DA_COR);

type DestinacaoComCor = { tag: string | null; cor: CorDaDestinacao | null };

function indiceInicial(tag: string): number {
  let hash = 0;
  for (const letra of tag) hash = (Math.imul(hash, 31) + letra.codePointAt(0)!) >>> 0;
  return hash % PALETA.length;
}

/**
 * Atribui uma cor a cada caixinha do conjunto, sem colisão até oito: as cores escolhidas pela pessoa ficam
 * reservadas, e as demais partem do hash e seguem para a próxima cor livre, em ordem alfabética das tags.
 * Passada a oito, a cor repete (a pessoa fixa a dela pelo seletor). Mesmo conjunto, mesmas cores.
 */
export function atribuirCoresDasDestinacoes(destinacoes: readonly DestinacaoComCor[]): ReadonlyMap<string, string> {
  const escolhidas = new Map<string, CorDaDestinacao>();
  const todas = new Set<string>();
  for (const { tag, cor } of destinacoes) {
    if (tag === null) continue;
    todas.add(tag);
    if (cor !== null && !escolhidas.has(tag)) escolhidas.set(tag, cor);
  }
  const mapa = new Map<string, string>();
  const tomadas = new Set<string>();
  for (const [tag, cor] of escolhidas) {
    mapa.set(tag, HEX_DA_COR[cor]);
    tomadas.add(HEX_DA_COR[cor]);
  }
  for (const tag of [...todas].filter((t) => !escolhidas.has(t)).sort()) {
    const inicio = indiceInicial(tag);
    let cor = PALETA[inicio];
    for (let passo = 0; passo < PALETA.length; passo++) {
      const candidata = PALETA[(inicio + passo) % PALETA.length];
      if (!tomadas.has(candidata)) {
        cor = candidata;
        break;
      }
    }
    mapa.set(tag, cor);
    tomadas.add(cor);
  }
  return mapa;
}

export function corDaDestinacao(tag: string, corEscolhida: CorDaDestinacao | null = null, atribuidas?: ReadonlyMap<string, string>): string {
  if (corEscolhida) return HEX_DA_COR[corEscolhida];
  return atribuidas?.get(tag) ?? PALETA[indiceInicial(tag)];
}
