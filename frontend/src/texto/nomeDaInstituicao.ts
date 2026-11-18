/** Normalização apenas de apresentação; nunca muda o nome persistido. */
export function normalizarNomeDaInstituicao(texto:string):string {
 if (/[a-zà-öø-ÿ]/.test(texto)) return texto;
 const limpo=texto.replace(/\bS\s*\.\s*A\s*\.?$|\bS\/A\b|\bLTDA\.?$/g,"").replace(/\bBANCO\s+(?=\S)/g,"").replace(/\s+-\s+/g," ").replace(/\s+/g," ").trim();
 const siglas=new Set(["BTG","CDB","LCI","LCA","CDI","XP","BB","CEF","FGC","IPCA","SELIC","ETF","FII","SA"]);
 return (limpo||texto).split(" ").map(p=>siglas.has(p)||/^[A-Z]{4}\d{1,2}$/.test(p)||p==="BANCO"?p:p.charAt(0)+p.slice(1).toLocaleLowerCase("pt-BR")).join(" ");
}
