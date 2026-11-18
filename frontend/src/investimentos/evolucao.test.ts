import { describe, expect, it } from "vitest";

import { JANELAS, montarSerie, periodoDaJanela, pontosDoGrafico, variacao } from "./evolucao";

const ponto = (investimento_id: string, data: string, saldo: string) => ({
  investimento_id,
  data,
  saldo,
});

describe("montarSerie", () => {
  const pontos = [
    ponto("a", "2026-10-01", "100.00"),
    ponto("b", "2026-10-01", "50.00"),
    ponto("a", "2026-10-02", "110.00"),
    ponto("b", "2026-10-03", "60.00"),
  ];

  it("soma os investimentos e repete o último saldo de quem não tem registro no dia", () => {
    expect(montarSerie(pontos)).toEqual([
      { data: "2026-10-01", saldo: "150.00" },
      { data: "2026-10-02", saldo: "160.00" },
      { data: "2026-10-03", saldo: "170.00" },
    ]);
  });

  it("filtra por investimento", () => {
    expect(montarSerie(pontos, "b")).toEqual([
      { data: "2026-10-01", saldo: "50.00" },
      { data: "2026-10-03", saldo: "60.00" },
    ]);
  });

  it("sem pontos não há série", () => {
    expect(montarSerie([])).toEqual([]);
  });

  it("não perde centavo em somas grandes", () => {
    const serie = montarSerie([ponto("a", "2026-10-01", "0.10"), ponto("b", "2026-10-01", "0.20")]);
    expect(serie[0].saldo).toBe("0.30");
  });
});

describe("variacao", () => {
  it("é o último menos o primeiro, com sinal", () => {
    expect(variacao([{ data: "d1", saldo: "100.00" }, { data: "d2", saldo: "90.50" }])).toBe(
      "-9.50",
    );
  });
  it("precisa de dois pontos", () => {
    expect(variacao([{ data: "d1", saldo: "1.00" }])).toBeNull();
  });
});

describe("periodoDaJanela", () => {
  it("30 dias terminando hoje, inclusive", () => {
    expect(periodoDaJanela("30dias", "2026-10-22")).toEqual({
      inicio: "2026-09-23",
      fim: "2026-10-22",
    });
  });
  it("atravessa o fim do ano", () => {
    expect(periodoDaJanela("90dias", "2026-01-10").inicio).toBe("2025-10-13");
  });
  it("tem três janelas", () => {
    expect(JANELAS.map((j) => j.janela)).toEqual(["30dias", "90dias", "1ano"]);
  });
});

describe("pontosDoGrafico", () => {
  const serie = [
    { data: "2026-10-01", saldo: "100.00" },
    { data: "2026-10-02", saldo: "150.00" },
    { data: "2026-10-03", saldo: "200.00" },
  ];

  it("espalha em x e põe o menor saldo embaixo e o maior em cima", () => {
    const pontos = pontosDoGrafico(serie, 120, 60, 10);
    expect(pontos.map((p) => [p.x, p.y])).toEqual([
      [10, 50],
      [60, 30],
      [110, 10],
    ]);
  });

  it("saldo constante fica no meio; um ponto só fica no meio do eixo x", () => {
    expect(pontosDoGrafico([serie[0], { ...serie[0], data: "2026-10-02" }], 120, 60, 10).map((p) => p.y)).toEqual([
      30, 30,
    ]);
    expect(pontosDoGrafico([serie[0]], 120, 60, 10)[0].x).toBe(60);
    expect(pontosDoGrafico([], 120, 60, 10)).toEqual([]);
  });
});
