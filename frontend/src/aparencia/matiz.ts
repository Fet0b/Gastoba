/** Nomes e vizinhanças da matiz (0 a 359), para falar da cor em texto e avisar sobre as semânticas. */

export const CORES_PRONTAS: readonly { matiz: number; nome: string }[] = [
  { matiz: 258, nome: "Roxo" },
  { matiz: 215, nome: "Azul" },
  { matiz: 185, nome: "Ciano" },
  { matiz: 150, nome: "Verde" },
  { matiz: 48, nome: "Amarelo" },
  { matiz: 25, nome: "Laranja" },
  { matiz: 355, nome: "Vermelho" },
  { matiz: 320, nome: "Rosa" },
];

/** Limites superiores (exclusivos) de cada faixa de matiz, com o nome aproximado da cor. */
const FAIXAS: readonly [number, string][] = [
  [15, "Vermelho"],
  [40, "Laranja"],
  [70, "Amarelo"],
  [100, "Lima"],
  [165, "Verde"],
  [195, "Ciano"],
  [235, "Azul"],
  [275, "Roxo"],
  [300, "Violeta"],
  [340, "Rosa"],
  [360, "Vermelho"],
];

export function nomeDaMatiz(matiz: number): string {
  const normalizada = ((Math.round(matiz) % 360) + 360) % 360;
  return (FAIXAS.find(([limite]) => normalizada < limite) ?? FAIXAS[FAIXAS.length - 1])[1];
}

/** Matiz das cores semânticas de `tokens.css` (positivo, negativo e atenção) e o seu papel. */
const SEMANTICAS: readonly { matiz: number; papel: string }[] = [
  { matiz: 142, papel: "entradas e metas atingidas (verde)" },
  { matiz: 350, papel: "saídas e erros (vermelho)" },
  { matiz: 42, papel: "pendências (âmbar)" },
];

const DISTANCIA_DE_AVISO = 20;

function distancia(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

/** O papel da cor semântica a menos de 20 graus da matiz, ou `null` se não há. */
export function semanticaProxima(matiz: number): string | null {
  return SEMANTICAS.find((s) => distancia(matiz, s.matiz) < DISTANCIA_DE_AVISO)?.papel ?? null;
}
