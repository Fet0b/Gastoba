import { describe, expect, it } from "vitest";

import { gastoAteHoje, MINIMO_DE_DIAS, projetarGastoDoMes } from "./projecao";

const g = (data: string, valor: string) => ({ data, valor });

describe("projetarGastoDoMes", () => {
  it("dia 15 de 30 com R$ 300,00 projeta R$ 600,00", () => {
    const r = projetarGastoDoMes({
      gastos: [g("2026-06-05", "100.00"), g("2026-06-14", "200.00")],
      periodo: { ano: 2026, mes: 6 },
      hoje: "2026-06-15",
    });
    expect(r).toEqual({ tipo: "estimativa", gasto: "300.00", estimativa: "600.00", dia: 15, diasDoMes: 30 });
  });

  it("dia 10 de 31 com R$ 100,00 dá R$ 310,00, sem arredondar para cima", () => {
    const r = projetarGastoDoMes({
      gastos: [g("2026-07-02", "100.00")],
      periodo: { ano: 2026, mes: 7 },
      hoje: "2026-07-10",
    });
    expect(r).toMatchObject({ tipo: "estimativa", estimativa: "310.00" });
  });

  it("arredonda para baixo em centavos", () => {
    // 0,10 * 31 / 3 = 1,0333... -> 1,03
    const r = projetarGastoDoMes({
      gastos: [g("2026-07-01", "0.10")],
      periodo: { ano: 2026, mes: 7 },
      hoje: "2026-07-03",
    });
    expect(r).toMatchObject({ tipo: "estimativa", estimativa: "1.03" });
  });

  it("no último dia a estimativa é o próprio gasto", () => {
    const r = projetarGastoDoMes({
      gastos: [g("2026-06-30", "123.45")],
      periodo: { ano: 2026, mes: 6 },
      hoje: "2026-06-30",
    });
    expect(r).toMatchObject({ tipo: "estimativa", gasto: "123.45", estimativa: "123.45" });
  });

  it("dia 1 e dia 2 dão poucos_dias, e o dia 3 já projeta", () => {
    const periodo = { ano: 2026, mes: 6 };
    const gastos = [g("2026-06-01", "10.00")];
    expect(MINIMO_DE_DIAS).toBe(3);
    expect(projetarGastoDoMes({ gastos, periodo, hoje: "2026-06-01" })).toEqual({
      tipo: "poucos_dias",
      gasto: "10.00",
    });
    expect(projetarGastoDoMes({ gastos, periodo, hoje: "2026-06-02" }).tipo).toBe("poucos_dias");
    expect(projetarGastoDoMes({ gastos, periodo, hoje: "2026-06-03" })).toMatchObject({
      tipo: "estimativa",
      estimativa: "100.00",
    });
  });

  it("zero gastos no dia 3 dá R$ 0,00", () => {
    const r = projetarGastoDoMes({ gastos: [], periodo: { ano: 2026, mes: 6 }, hoje: "2026-06-03" });
    expect(r).toMatchObject({ tipo: "estimativa", gasto: "0.00", estimativa: "0.00" });
  });

  it("mês passado dá encerrado com a soma de todos os gastos do mês", () => {
    const r = projetarGastoDoMes({
      gastos: [g("2026-05-01", "10.00"), g("2026-05-31", "5.50")],
      periodo: { ano: 2026, mes: 5 },
      hoje: "2026-06-15",
    });
    expect(r).toEqual({ tipo: "encerrado", gasto: "15.50" });
  });

  it("mês passado em outro ano também encerra", () => {
    const r = projetarGastoDoMes({ gastos: [], periodo: { ano: 2025, mes: 12 }, hoje: "2026-01-02" });
    expect(r).toEqual({ tipo: "encerrado", gasto: "0.00" });
  });

  it("mês futuro dá futuro, sem projetar gastos com data nele", () => {
    const r = projetarGastoDoMes({
      gastos: [g("2026-07-10", "50.00")],
      periodo: { ano: 2026, mes: 7 },
      hoje: "2026-06-30",
    });
    expect(r).toEqual({ tipo: "futuro" });
  });

  it("fevereiro bissexto tem 29 dias e o não bissexto, 28", () => {
    const bissexto = projetarGastoDoMes({
      gastos: [g("2028-02-05", "10.00")],
      periodo: { ano: 2028, mes: 2 },
      hoje: "2028-02-10",
    });
    expect(bissexto).toMatchObject({ diasDoMes: 29, estimativa: "29.00" });
    const comum = projetarGastoDoMes({
      gastos: [g("2026-02-05", "10.00")],
      periodo: { ano: 2026, mes: 2 },
      hoje: "2026-02-10",
    });
    expect(comum).toMatchObject({ diasDoMes: 28, estimativa: "28.00" });
  });

  it("ignora o gasto com data depois de hoje", () => {
    const r = projetarGastoDoMes({
      gastos: [g("2026-06-05", "100.00"), g("2026-06-20", "900.00")],
      periodo: { ano: 2026, mes: 6 },
      hoje: "2026-06-10",
    });
    expect(r).toMatchObject({ tipo: "estimativa", gasto: "100.00", estimativa: "300.00" });
  });

  it("ignora o gasto de outro mês", () => {
    const r = projetarGastoDoMes({
      gastos: [g("2026-05-30", "900.00"), g("2026-06-05", "100.00")],
      periodo: { ano: 2026, mes: 6 },
      hoje: "2026-06-10",
    });
    expect(r).toMatchObject({ gasto: "100.00" });
  });

  it("não perde precisão com R$ 999.999.999.999,99", () => {
    const r = projetarGastoDoMes({
      gastos: [g("2026-06-01", "999999999999.99")],
      periodo: { ano: 2026, mes: 6 },
      hoje: "2026-06-30",
    });
    expect(r).toMatchObject({ gasto: "999999999999.99", estimativa: "999999999999.99" });
    const meio = projetarGastoDoMes({
      gastos: [g("2026-06-01", "999999999999.99")],
      periodo: { ano: 2026, mes: 6 },
      hoje: "2026-06-15",
    });
    // 99999999999999 * 30 / 15 = 199999999999998
    expect(meio).toMatchObject({ estimativa: "1999999999999.98" });
  });
});

describe("gastoAteHoje", () => {
  const periodo = { ano: 2026, mes: 10 };
  const gastos = [
    { valor: "100.00", data: "2026-10-05" },
    { valor: "50.50", data: "2026-10-10" },
    { valor: "70.00", data: "2026-10-20" },
  ];

  it("soma só o que tem data até hoje, inclusive hoje", () => {
    expect(gastoAteHoje({ gastos, periodo, hoje: "2026-10-10" })).toBe("150.50");
  });

  it("mês passado soma o mês inteiro", () => {
    expect(gastoAteHoje({ gastos, periodo, hoje: "2026-12-01" })).toBe("220.50");
  });

  it("mês futuro dá zero", () => {
    expect(gastoAteHoje({ gastos, periodo, hoje: "2026-09-30" })).toBe("0.00");
  });
});
