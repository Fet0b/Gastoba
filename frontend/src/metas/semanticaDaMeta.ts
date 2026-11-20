import type {ProgressoDaMeta} from "../api/tipos";
import {deCentavos,paraCentavos} from "../dinheiro/dinheiro";
export function tipoDaMeta(categoria:string):"guardar"|"gastar" {return categoria==="liberdade_financeira"?"guardar":"gastar";}
export function leituraDaMeta(meta:ProgressoDaMeta):{tom:"neutro"|"positivo"|"negativo"|"atencao";rotulo:string;valor:string|null} {
 if(meta.situacao==="sem_renda")return {tom:"neutro",rotulo:"Sem renda no mês",valor:null};
 const diferenca=paraCentavos(meta.limite)-paraCentavos(meta.gasto);
 const valor=deCentavos(diferenca<0n?-diferenca:diferenca);
 if(tipoDaMeta(meta.categoria)==="guardar")return diferenca>0n?{tom:"neutro",rotulo:"Faltam",valor}:diferenca===0n?{tom:"positivo",rotulo:"Meta batida",valor:null}:{tom:"positivo",rotulo:"Superou em",valor};
 return diferenca<0n?{tom:"negativo",rotulo:"Passou",valor}:{tom:meta.situacao==="alerta"?"atencao":"positivo",rotulo:"Restam",valor};
}
export function ordenarPorRelevancia(metas:readonly ProgressoDaMeta[]):ProgressoDaMeta[]{const prioridade=(m:ProgressoDaMeta)=>{const l=leituraDaMeta(m);return l.tom==="negativo"?0:l.tom==="atencao"?1:tipoDaMeta(m.categoria)==="guardar"&&l.tom==="positivo"?2:3;};return [...metas].sort((a,b)=>prioridade(a)-prioridade(b)||(b.percentual_usado??0)-(a.percentual_usado??0));}
