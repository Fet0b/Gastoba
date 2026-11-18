import { expect, it } from "vitest";
import { agruparInvestimentos } from "./grupos";
it("usa os cinco grupos previstos sem perder tipos ou centavos",()=>{
 const entrada=["FIXED_INCOME","EQUITY","ETF","MUTUAL_FUND","CAIXINHA","SECURITY","COE","NOVO"].map((tipo,id)=>({id,tipo,saldo:"0.01"}));
 const grupos=agruparInvestimentos(entrada);
 expect(grupos.map(g=>g.nome)).toEqual(["Renda fixa","Ações","Fundos","Conta investimentos","Outros"]);
 expect(grupos.map(g=>g.total)).toEqual(["0.01","0.02","0.01","0.01","0.03"]);
 expect(grupos.flatMap(g=>g.investimentos).map(i=>i.tipo).sort()).toEqual(entrada.map(i=>i.tipo).sort());
});
