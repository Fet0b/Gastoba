/**
 * O rótulo para exibição: a primeira letra em maiúscula. As tags e destinações são guardadas em
 * minúsculas (normalização); este texto é só para mostrar, nunca para enviar à API nem para campos
 * de edição.
 */
export function rotuloDeExibicao(texto: string): string {
  if (texto === "") return texto;
  const [primeira = ""] = texto;
  return primeira.toLocaleUpperCase("pt-BR") + texto.slice(primeira.length);
}
