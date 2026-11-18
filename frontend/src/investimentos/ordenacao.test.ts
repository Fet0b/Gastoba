import { expect, it } from "vitest";
import { ordenarInvestimentos } from "./ordenacao";
import type { Investimento } from "../api/tipos";
const posicao = (id:string, saldo:string, rendimento:string|null, vencimento?:string):Investimento => ({id,nome:id,tipo:"FIXED_INCOME",subtipo:null,saldo,rendimento,vencimento,valor_aplicado:null,rentabilidade:null,origem_da_rentabilidade:null,taxa:null,atualizado_em:null,destinacoes:[]});
it("ordena saldos em centavos sem alterar a entrada",()=>{const lista=[posicao("a","0.10",null),posicao("b","0.20",null)];expect(ordenarInvestimentos(lista,"saldo").map(i=>i.id)).toEqual(["b","a"]);expect(lista[0].id).toBe("a");});
it("põe rendimentos e vencimentos desconhecidos por último",()=>{const lista=[posicao("a","1.00",null),posicao("b","1.00","-1.00","2026-12-01"),posicao("c","1.00","0.01","2026-11-01")];expect(ordenarInvestimentos(lista,"rendimento").map(i=>i.id)).toEqual(["c","b","a"]);expect(ordenarInvestimentos(lista,"vencimento").map(i=>i.id)).toEqual(["c","b","a"]);});
