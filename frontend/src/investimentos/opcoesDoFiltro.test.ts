import { describe, expect, it } from "vitest";
import { opcoesDoFiltroDeInvestimento } from "./opcoesDoFiltro";

const base = { subtipo: null };

describe("opcoesDoFiltroDeInvestimento", () => {
  it("agrupa por categoria e deixa as fixas de fora dos grupos", () => {
    const { grupos } = opcoesDoFiltroDeInvestimento([
      { ...base, id: "a", nome: "Ação X", tipo: "EQUITY", saldo: "10.00" },
      { ...base, id: "b", nome: "CDB Y", tipo: "FIXED_INCOME", saldo: "20.00" },
    ]);
    expect(grupos.map((g) => g.nome)).toEqual(["Renda fixa", "Ações"]);
    expect(grupos[0].opcoes).toEqual([{ valor: "b", rotulo: "CDB Y" }]);
  });

  it("distingue nomes repetidos pelo saldo, do maior ao menor, com (2), (3)", () => {
    const { grupos } = opcoesDoFiltroDeInvestimento([
      { ...base, id: "a", nome: "CDB", tipo: "FIXED_INCOME", saldo: "5.00" },
      { ...base, id: "b", nome: "CDB", tipo: "FIXED_INCOME", saldo: "900.00" },
      { ...base, id: "c", nome: "CDB", tipo: "FIXED_INCOME", saldo: "70.00" },
    ]);
    const rotulos = Object.fromEntries(grupos[0].opcoes.map((o) => [o.valor, o.rotulo]));
    expect(rotulos).toEqual({ b: "CDB", c: "CDB (2)", a: "CDB (3)" });
  });

  it("sem investimentos, não há grupos", () => {
    expect(opcoesDoFiltroDeInvestimento([]).grupos).toEqual([]);
  });
});


describe("rótulo único da API", () => {
  it("usa o rótulo como veio, sem sufixo numérico, e os 44 CDBs do mesmo banco ficam distintos", () => {
    const entradas = Array.from({ length: 44 }, (_, n) => ({
      id: `id-${n}`, nome: "CDB - BANCO INTER S.A", tipo: "FIXED_INCOME", saldo: "100.00",
      rotulo: `CDB Inter, final ${String(n).padStart(4, "0")}`,
    }));
    const rotulos = opcoesDoFiltroDeInvestimento(entradas).grupos.flatMap((g) => g.opcoes.map((o) => o.rotulo));
    expect(new Set(rotulos).size).toBe(44);
    expect(rotulos.some((r) => /\(\d+\)/.test(r))).toBe(false);
  });
});
