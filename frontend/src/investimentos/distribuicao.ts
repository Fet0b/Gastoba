import type { CorDaDestinacao, FatiaDeInvestimento, VisaoDosInvestimentos } from "../api/tipos";
import { deCentavos, paraCentavos } from "../dinheiro/dinheiro";
import { rotuloDoTipo } from "./rotulo";

export const CHAVE_SEM_DESTINACAO = "\u{0}sem_destinacao";
export const CHAVE_CAIXINHA_SEM_DESTINACAO = "\u{0}caixinha_sem_destinacao";
/** Fatias especiais: cor neutra do mapa central, nunca a de uma caixinha. */
export const CHAVES_NEUTRAS = [CHAVE_SEM_DESTINACAO, CHAVE_CAIXINHA_SEM_DESTINACAO] as const;
const NOMES: Readonly<Record<string,string>> = { FIXED_INCOME:"Renda fixa", MUTUAL_FUND:"Fundos", EQUITY:"Ações", ETF:"ETFs", SECURITY:"Previdência e outros", COE:"COE", OTHER:"Outros" };
type Posicao = {tipo:string;destinacoes:readonly {tag:string|null;valor_atual:string}[]};
export function entradasDaDistribuicao(fatias: readonly FatiaDeInvestimento[], visao: VisaoDosInvestimentos, posicoes: readonly Posicao[], corDaDestinacao: (tag: string, cor: CorDaDestinacao | null) => string) {
 const caixinhas = posicoes.filter(i => i.tipo === "CAIXINHA").flatMap(i => i.destinacoes).filter(d => d.tag === null).reduce((s,d) => s + paraCentavos(d.valor_atual),0n);
 return fatias.flatMap(f => {
  if(f.rotulo === null && visao === "destinacao" && caixinhas > 0n) {
   const total = paraCentavos(f.valor), parcela = caixinhas < total ? caixinhas : total;
   return [
    ...(total > parcela ? [{chave:CHAVE_SEM_DESTINACAO,rotulo:"Sem destinação",valor:deCentavos(total-parcela),cor:null}] : []),
    {chave:CHAVE_CAIXINHA_SEM_DESTINACAO,rotulo:"Caixinha sem destinação",valor:deCentavos(parcela),cor:null},
   ];
  }
  return [{chave:f.rotulo ?? CHAVE_SEM_DESTINACAO,rotulo:f.rotulo === null ? "Sem destinação" : visao === "tipo" ? NOMES[f.rotulo] ?? rotuloDoTipo(f.rotulo) : f.rotulo,valor:f.valor,cor:f.rotulo === null || visao === "tipo" ? null : corDaDestinacao(f.rotulo, f.cor)}];
 });
}
