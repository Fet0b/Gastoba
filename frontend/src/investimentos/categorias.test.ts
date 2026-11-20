import { describe, expect, it } from "vitest";

import { agruparInvestimentos, agruparRendaFixa } from "./categorias";

describe("agruparInvestimentos", () => {
  it("separa os tipos na ordem de apresentação, preserva as posições e reúne desconhecidos em Outros", () => {
    const tipos = ["NOVO", "EQUITY", "FIXED_INCOME", "ETF", "MUTUAL_FUND", "SECURITY", "COE", "OTHER", "FIXED_INCOME"];
    const entrada = tipos.map((tipo, id) => ({ tipo, saldo: "0.01", id }));
    const grupos = agruparInvestimentos(entrada);

    expect(grupos.map((g) => g.nome)).toEqual([
      "Renda fixa", "Ações", "Fundos", "Outros",
    ]);
    expect(grupos.map((g) => g.investimentos.map((i) => i.id))).toEqual([
      [2, 8], [1, 3], [4], [0, 5, 6, 7],
    ]);
    expect(entrada.map((i) => i.tipo)).toEqual(tipos);
    expect(grupos[0].investimentos[0]).toBe(entrada[2]);
  });

  it("soma os saldos com centavos exatos, inclusive grandes, negativos e zero", () => {
    const grupos = agruparInvestimentos([
      { tipo: "FIXED_INCOME", saldo: "999999999999.98" },
      { tipo: "FIXED_INCOME", saldo: "0.01" },
      { tipo: "FIXED_INCOME", saldo: "0.01" },
      { tipo: "EQUITY", saldo: "-0.01" },
      { tipo: "EQUITY", saldo: "0.00" },
    ]);
    expect(grupos.map((g) => g.total)).toEqual(["1000000000000.00", "-0.01"]);
    expect(grupos[1].investimentos).toHaveLength(2);
  });

  it("não cria grupos vazios", () => {
    expect(agruparInvestimentos([])).toEqual([]);
    expect(agruparInvestimentos([{ tipo: "OTHER", saldo: "0.00" }])).toHaveLength(1);
  });
});

describe("agruparRendaFixa", () => {
  const posicao = (id: number, subtipo: string | null, saldo = "1.00") => ({ id, subtipo, saldo });

  it("separa por tipo de título, junta LCI com LCA e CRI com CRA, e usa a ordem de apresentação", () => {
    const grupos = agruparRendaFixa([
      posicao(0, "DEBENTURES"),
      posicao(1, "CRA"),
      posicao(2, "TREASURY"),
      posicao(3, "LCA"),
      posicao(4, "CDB"),
      posicao(5, "CRI"),
      posicao(6, "LCI"),
    ]);

    expect(grupos.map((g) => g.nome)).toEqual([
      "CDBs",
      "LCIs e LCAs",
      "Tesouro Direto",
      "Debêntures",
      "CRIs e CRAs",
    ]);
    expect(grupos.map((g) => g.investimentos.map((i) => i.id))).toEqual([[4], [3, 6], [2], [0], [1, 5]]);
  });

  it("manda LC, LF, LIG, subtipo desconhecido ou ausente para Outras de renda fixa", () => {
    const grupos = agruparRendaFixa([
      posicao(0, "LF"),
      posicao(1, null),
      posicao(2, "LIG"),
      posicao(3, "LC"),
      posicao(4, "ALGO_NOVO"),
    ]);

    expect(grupos.map((g) => g.nome)).toEqual(["Outras de renda fixa"]);
    expect(grupos[0].investimentos.map((i) => i.id)).toEqual([0, 1, 2, 3, 4]);
  });

  it("ignora maiúsculas, espaços e o singular DEBENTURE", () => {
    const grupos = agruparRendaFixa([posicao(0, " cdb "), posicao(1, "debenture"), posicao(2, "Lci")]);

    expect(grupos.map((g) => g.nome)).toEqual(["CDBs", "LCIs e LCAs", "Debêntures"]);
  });

  it("soma os saldos em centavos exatos, não cria grupos vazios e não altera a entrada", () => {
    const entrada = [posicao(0, "CDB", "999999999999.98"), posicao(1, "CDB", "0.01"), posicao(2, "CDB", "0.01")];
    const grupos = agruparRendaFixa(entrada);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].total).toBe("1000000000000.00");
    expect(grupos[0].investimentos[0]).toBe(entrada[0]);
    expect(agruparRendaFixa([])).toEqual([]);
  });
});
