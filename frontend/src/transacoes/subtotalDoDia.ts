import {deCentavos,paraCentavos} from "../dinheiro/dinheiro";
/** Valores brutos exibidos nas linhas; compra coberta continua mostrando seu valor original. */
export function subtotalDoDia(linhas:readonly {tipo:"ganho"|"gasto"|"aporte";valor:string}[]):string{return deCentavos(linhas.reduce((s,l)=>s+(l.tipo==="ganho"?1n:-1n)*paraCentavos(l.valor),0n));}
