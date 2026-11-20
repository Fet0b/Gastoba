import { expect, it } from "vitest";
import { entradasDaDistribuicao } from "./distribuicao";
it("separa a parcela sem destinação de caixinha e de outros ativos sem perder centavos", () => {
 const entradas = entradasDaDistribuicao([{rotulo:null,valor:"1000.00",cor:null}], "destinacao", [{tipo:"CAIXINHA",destinacoes:[{tag:null,valor_atual:"962.17"}]}], () => "#000000");
 expect(entradas.map(e => [e.rotulo,e.valor])).toEqual([["Sem destinação","37.83"],["Caixinha sem destinação","962.17"]]);
});
