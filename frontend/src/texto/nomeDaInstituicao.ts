/** Siglas de produto e indexador que ficam em caixa alta na tela. */
export const SIGLAS_DE_INVESTIMENTO: ReadonlySet<string> = new Set([
  "BTG","CDB","LCI","LCA","CRI","CRA","CDI","CDC","RDB","COE","XP","BB","CEF","FGC","IPCA","IGPM","SELIC","TR","DI","ETF","FII","FIA","FIC","FIM","FIDC","PGBL","VGBL",
]);

/**
 * Normalização apenas de apresentação; nunca muda o nome persistido. Age palavra por palavra:
 * palavra toda em caixa alta (2 letras ou mais) vira capitalizada (em texto misto, só com 2 ou mais delas), exceto siglas conhecidas e
 * códigos de ativo (ITUB4); "S.A.", "SA" e "LTDA" saem; o resto do texto fica como veio.
 */
export function normalizarNomeDaInstituicao(texto:string):string {
 const limpo=texto
  .replace(/\bS\s*\.\s*A\s*\.?(?=\s|$)|\bS\/A\b|\bLTDA\.?(?=\s|$)|(?<=\s|^)SA(?=\s|$)/g,"")
  .replace(/\bBANCO\s+(?=(?!D[OAE]\b)\S)/g,"")
  .replace(/\s+-\s+/g," ").replace(/\s+/g," ").trim();
 const base=limpo||texto;
 if(base==="BANCO") return base;
 const palavras=base.split(" ");
 const caixaAlta=(p:string)=>/^[A-ZÀ-ÖØ-Þ]{2,}\+?$/.test(p)&&!SIGLAS_DE_INVESTIMENTO.has(p.replace(/\+$/,""));
 // Texto misto só é mexido com duas palavras em caixa alta ou mais: "Livro de TS" continua como a pessoa escreveu.
 const todoEmCaixaAlta=!/[a-zà-öø-ÿ]/.test(base);
 if(!todoEmCaixaAlta&&texto.split(" ").filter(caixaAlta).length<2) return base;
 return palavras.map(p=>caixaAlta(p)?p.charAt(0)+p.slice(1).toLocaleLowerCase("pt-BR"):p).join(" ");
}
