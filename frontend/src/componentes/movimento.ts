// Preferência de "reduzir movimento" do sistema, compartilhada pelos
// componentes que animam (olho, valor animado, destaque de cartão).

export const CONSULTA_MENOS_MOVIMENTO = "(prefers-reduced-motion: reduce)";

/** `true` quando a pessoa pediu menos movimento ao sistema. */
export function prefereMenosMovimento(): boolean {
  return typeof window.matchMedia === "function"
    ? window.matchMedia(CONSULTA_MENOS_MOVIMENTO).matches
    : false;
}
