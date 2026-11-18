import { describe, expect, it } from "vitest";

import { rotuloDoInvestimento } from "./rotulo";

const CDB = {
  nome: "CDB - BANCO INTER S.A",
  taxa: { percentual: "104", indexador: "CDI", adicional_anual: null },
  vencimento: "2027-03-15",
};

describe("rotuloDoInvestimento", () => {
  it("junta nome, taxa e vencimento", () => {
    expect(rotuloDoInvestimento(CDB)).toBe("CDB - BANCO INTER S.A, 104% CDI, vence 03/2027");
  });

  it("omite o que a instituição não informa", () => {
    expect(rotuloDoInvestimento({ nome: "AUPO11", taxa: null, vencimento: null })).toBe("AUPO11");
    expect(rotuloDoInvestimento({ nome: "LCI", taxa: null })).toBe("LCI");
  });

  it("vencimento malformado é ignorado", () => {
    expect(rotuloDoInvestimento({ nome: "LCI", taxa: null, vencimento: "ontem" })).toBe("LCI");
  });
});

it("traduz o tipo com fallback", async () => {
 const { rotuloDoTipo } = await import("./rotulo");
 expect(["STOCK","CAIXINHA","CDB","LCI","LCA","CRI","CRA","DESCONHECIDO"].map(rotuloDoTipo)).toEqual(["Ação","Conta investimentos","CDB","LCI","LCA","CRI","CRA","DESCONHECIDO"]);
});
it("distingue opções pelo saldo e aplicação no empate", async () => {
 const { rotulosDaEvolucao } = await import("./rotulo");
 const itens = [
  {...CDB,id:"a",saldo:"405.91",data_de_aplicacao:"2026-10-01"},
  {...CDB,id:"b",saldo:"405.91",data_de_aplicacao:"2026-10-02"},
 ];
 const rotulos = rotulosDaEvolucao(itens);
 expect(rotulos[0]).toContain("CDB Inter");
 expect(rotulos[0]).toContain("405,91");
 expect(rotulos[0]).toContain("01/10/2026");
 expect(rotulos[1]).toContain("02/10/2026");
 expect(new Set(rotulos).size).toBe(2);
});
