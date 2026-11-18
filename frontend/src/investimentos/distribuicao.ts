import type { FatiaDeInvestimento, VisaoDosInvestimentos } from "../api/tipos";
import { deCentavos, paraCentavos } from "../dinheiro/dinheiro";
import { corDaDestinacao } from "../cores/mapaDeCores";
import { rotuloDoTipo } from "./rotulo";

export const CHAVE_SEM_DESTINACAO = "\u{0}sem_destinacao";
const NOMES: Readonly<Record<string,string>> = { FIXED_INCOME:"Renda fixa", MUTUAL_FUND:"Fundos", EQUITY:"Ações", ETF:"ETFs", SECURITY:"Previdência e outros", COE:"COE", OTHER:"Outros" };
type Posicao = {tipo:string;destinacoes:readonly {tag:string|null;valor_atual:string}[]};
export function entradasDaDistribuicao(fatias: readonly FatiaDeInvestimento[], visao: VisaoDosInvestimentos, posicoes: readonly Posicao[]) {
 const caixinhas = posicoes.filter(i => i.tipo === "CAIXINHA").flatMap(i => i.destinacoes).filter(d => d.tag === null).reduce((s,d) => s + paraCentavos(d.valor_atual),0n);
 return fatias.flatMap(f => {
  if(f.rotulo === null && visao === "destinacao" && caixinhas > 0n) {
   const total = paraCentavos(f.valor), parcela = caixinhas < total ? caixinhas : total;
   return [
    ...(total > parcela ? [{chave:CHAVE_SEM_DESTINACAO,rotulo:"Sem destinação",valor:deCentavos(total-parcela),cor:null}] : []),
    {chave:"\u{0}caixinha_sem_destinacao",rotulo:"Caixinha sem destinação",valor:deCentavos(parcela),cor:null},
   ];
  }
  return [{chave:f.rotulo ?? CHAVE_SEM_DESTINACAO,rotulo:f.rotulo === null ? "Sem destinação" : visao === "tipo" ? NOMES[f.rotulo] ?? rotuloDoTipo(f.rotulo) : f.rotulo,valor:f.valor,cor:f.rotulo === null || visao === "tipo" ? null : corDaDestinacao(f.rotulo, f.cor)}];
 });
}
