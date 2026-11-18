/** Até duas iniciais: a primeira letra do primeiro e do último nome; "?" sem nome. */
export function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter((parte) => parte);
  if (partes.length === 0) return "?";
  const primeira = Array.from(partes[0])[0];
  if (partes.length === 1) return primeira.toLocaleUpperCase("pt-BR");
  return (primeira + Array.from(partes[partes.length - 1])[0]).toLocaleUpperCase("pt-BR");
}
