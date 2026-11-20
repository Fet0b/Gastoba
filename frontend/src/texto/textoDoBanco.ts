/**
 * Descrição vinda do banco para exibição (XI.5.6): só age sobre texto sem nenhuma minúscula e o
 * deixa com a primeira letra de cada palavra em maiúscula. Siglas conhecidas, códigos de ativo
 * ("ITUB4"), palavras com número e abreviações com ponto ("S.A.") ficam como vieram; "LTDA" e
 * "BANCO" não saem do texto. Texto de caixa mista não é tocado. Nunca é enviado à API nem usado em busca.
 */
const SIGLAS = new Set(["BTG", "CDB", "LCI", "LCA", "CDI", "XP", "BB", "CEF", "FGC", "IPCA", "SELIC", "ETF", "FII", "SA", "LTDA", "MEI", "CPF", "CNPJ", "TED", "DOC"]);

function preservar(palavra: string): boolean {
  const base = palavra.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, "");
  return SIGLAS.has(base) || /\d/.test(base) || /^(?:\p{Lu}\.)+\p{Lu}?\.?$/u.test(palavra);
}

export function textoDoBanco(texto: string): string {
  if (/\p{Ll}/u.test(texto)) return texto;
  return texto
    .split(/(\s+)/)
    .map((trecho) =>
      /^\s*$/.test(trecho) || preservar(trecho)
        ? trecho
        : trecho.replace(/\p{L}+/gu, (parte) => parte.charAt(0) + parte.slice(1).toLocaleLowerCase("pt-BR")),
    )
    .join("");
}
