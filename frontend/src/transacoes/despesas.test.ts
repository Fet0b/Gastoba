import {it,expect} from "vitest";
import type {Gasto,MovimentoDeInvestimento} from "../api/tipos";
import {despesasDoPeriodo,fatiasDoAporte} from "./despesas";
import {gastoAcumuladoPorDia} from "../graficos/ritmo";
import {gastoAteHoje} from "../projecao/projecao";

it("cobertura parcial desconta só a parte coberta nas despesas",()=>{
 const g:Gasto={id:"g",conta_id:"c",valor:"80.00",valor_coberto:"30.00",coberturas:[{id:"x",tag:"celular",valor:"30.00"}],descricao:"Compra fictícia",data:"2026-11-10",categoria:"conforto",tags:["loja"],origem:"manual",recorrencia_id:null};
 const m:MovimentoDeInvestimento={id:"m",conta_id:"c",investimento_id:null,tipo:"aporte",categoria:"conforto",revisao_pendente:false,transacao_importada_id:null,origem:"open_finance",valor:"50.00",descricao:"Aporte fictício",data:g.data,destinacoes:[]};
 const despesas=despesasDoPeriodo([{...g,id:"a",valor:"100.00",valor_coberto:"0.00",coberturas:[]},g,{...g,id:"zero",valor_coberto:"80.00"}], [m,{...m,id:"sem",categoria:null},{...m,id:"resgate",tipo:"resgate"}]);
 expect(despesas.map(d=>d.valor)).toEqual(["100.00","50.00"]);
 expect(gastoAteHoje({gastos:despesas,periodo:{ano:2026,mes:11},hoje:"2026-11-10"})).toBe("150.00");
 expect(gastoAcumuladoPorDia(despesas,{ano:2026,mes:11},10).at(-1)).toBe("150.00");
 expect(g.valor).toBe("80.00");
});

it("parte de caixinha vinculada não vira despesa de categoria", () => {
 const aporte:MovimentoDeInvestimento={id:"a",conta_id:"c",investimento_id:"i",tipo:"aporte",categoria:"lazer",revisao_pendente:false,transacao_importada_id:null,origem:"open_finance",valor:"5000.00",descricao:"Aporte fictício",data:"2026-11-10",destinacoes:[{tag:"computador",valor:"3500.00",categoria:"conforto",coberto:null},{tag:"patrimonio",valor:"1500.00",categoria:null,coberto:null}]};
 const despesas=despesasDoPeriodo([],[aporte]);
 // A categoria do aporte inteiro (lazer) deixa de valer quando alguma parte tem vínculo.
 expect(despesas.map(d=>[d.categoria,d.valor])).toEqual([]);
 expect(fatiasDoAporte(aporte)).toEqual([{categoria:null,valor:"5000.00"}]);
});

it("categoria histórica do aporte não o transforma em despesa", () => {
 const aporte:MovimentoDeInvestimento={id:"a",conta_id:"c",investimento_id:"i",tipo:"aporte",categoria:"lazer",revisao_pendente:false,transacao_importada_id:null,origem:"open_finance",valor:"100.00",descricao:"Aporte fictício",data:"2026-11-10",destinacoes:[{tag:"x",valor:"100.00",categoria:null,coberto:null}]};
 expect(despesasDoPeriodo([],[aporte]).map(d=>[d.categoria,d.valor])).toEqual([]);
});

it("LIQ BOLSA categorizado não aumenta Lazer nem a projeção de gastos", () => {
 const g:Gasto={id:"g",conta_id:"c",valor:"32.00",valor_coberto:"0.00",coberturas:[],descricao:"Lazer real",data:"2026-11-04",categoria:"lazer",tags:[],origem:"manual",recorrencia_id:null};
 const m:MovimentoDeInvestimento={id:"m",conta_id:"c",investimento_id:null,tipo:"aporte",categoria:"lazer",revisao_pendente:false,transacao_importada_id:null,origem:"open_finance",valor:"2789.30",descricao:"LIQ BOLSA",data:g.data,destinacoes:[]};
 const despesas=despesasDoPeriodo([g],[m]);
 expect(despesas.map(d=>d.valor)).toEqual(["32.00"]);
 expect(gastoAteHoje({gastos:despesas,periodo:{ano:2026,mes:11},hoje:"2026-11-08"})).toBe("32.00");
});
