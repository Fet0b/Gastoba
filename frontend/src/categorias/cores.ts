// Cor de cada categoria, indexada pelo `codigo` de GET /categorias. A cor só
// acompanha o nome da categoria em texto, nunca o substitui.

/** Bruma: cor de uma categoria que o frontend ainda não conhece. */
export const COR_DE_CATEGORIA_DESCONHECIDA = "#9A8FB8";

const CORES_DAS_CATEGORIAS: Readonly<Record<string, string>> = {
  investimentos: "#5BD6B0",
  lazer: "#E879F9",
  conhecimento: "#60A5FA",
  conforto: "#FBBF24",
  gasto_fixo: "#B7A8E8",
};

export function corDaCategoria(codigo: string): string {
  return Object.hasOwn(CORES_DAS_CATEGORIAS, codigo)
    ? CORES_DAS_CATEGORIAS[codigo]
    : COR_DE_CATEGORIA_DESCONHECIDA;
}
