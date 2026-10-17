// Tags espelham as regras do backend (`Tag.de_texto` e suas validações).

/** Máximo de tags distintas por gasto. */
export const LIMITE_DE_TAGS = 10;

/** Máximo de caracteres (code points) por tag. */
export const TAMANHO_MAXIMO_DA_TAG = 30;

// Equivalente ao `str.isprintable()` do Python: controles, formatação,
// substitutos, uso privado, não atribuídos e separadores não são imprimíveis,
// exceto o espaço comum.
const NAO_IMPRIMIVEL = /[\p{C}\p{Z}]/u;

// Exatamente os espaços do `str.split()` do Python. O `\s` e o `trim()` do
// JavaScript diferem: tratam U+FEFF como espaço e não tratam U+001C–U+001F nem
// U+0085, o que faria o frontend aceitar ou recusar tags que o backend não aceita
// ou recusa.
const ESPACOS =
  /[\t\n\v\f\r\x1c-\x1f \x85\xa0\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}]+/u;

const ESPACOS_NAS_PONTAS = new RegExp(`^${ESPACOS.source}|${ESPACOS.source}$`, "gu");

/**
 * Remove os espaços das pontas como o `str.strip()` do backend faz com nomes de
 * conta e descrições de gasto (mesmo conjunto de espaços do `str.split()`).
 */
export function aparar(texto: string): string {
  return texto.replace(ESPACOS_NAS_PONTAS, "");
}

/** Remove espaços das pontas, colapsa os internos e passa para minúsculas. */
export function normalizarTag(texto: string): string {
  return texto
    .split(ESPACOS)
    .filter((parte) => parte !== "")
    .join(" ")
    .toLowerCase();
}

/** Mensagem do problema da tag (já normalizada), ou `null` se for válida. */
export function validarTag(tag: string): string | null {
  const caracteres = [...tag];
  if (caracteres.length < 1 || caracteres.length > TAMANHO_MAXIMO_DA_TAG) {
    return `A tag deve ter de 1 a ${TAMANHO_MAXIMO_DA_TAG} caracteres.`;
  }
  if (caracteres.some((caractere) => caractere !== " " && NAO_IMPRIMIVEL.test(caractere))) {
    return "A tag não pode ter caracteres não imprimíveis.";
  }
  return null;
}
