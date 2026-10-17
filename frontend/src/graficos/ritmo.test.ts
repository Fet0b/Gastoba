import { describe, expect, it } from "vitest";

import {
  diasDoMes,
  escalaDeValores,
  gastoAcumuladoPorDia,
  razaoDe,
  ritmoIdealPorDia,
  rotuloCompacto,
} from "./ritmo";

const ABRIL = { ano: 2026, mes: 4 };

describe("diasDoMes", () => {
  it("conta os dias, com fevereiro bissexto", () => {
    expect(diasDoMes(ABRIL)).toBe(30);
    expect(diasDoMes({ ano: 2026, mes: 1 })).toBe(31);
    expect(diasDoMes({ ano: 2026, mes: 2 })).toBe(28);
    expect(diasDoMes({ ano: 2028, mes: 2 })).toBe(29);
  });
});

describe("gastoAcumuladoPorDia", () => {
  it("soma gastos do mesmo dia e carrega o valor adiante", () => {
    const curva = gastoAcumuladoPorDia(
      [
        { data: "2026-04-02", valor: "0.10" },
        { data: "2026-04-02", valor: "0.20" },
        { data: "2026-04-04", valor: "10.00" },
      ],
      ABRIL,
      5,
    );

    expect(curva).toEqual(["0.00", "0.30", "0.30", "10.30", "10.30"]);
  });

  it("termina no dia pedido e ignora gastos de fora do mês", () => {
    const curva = gastoAcumuladoPorDia(
      [
        { data: "2026-03-31", valor: "5.00" },
        { data: "2026-05-01", valor: "7.00" },
        { data: "2026-04-03", valor: "1.00" },
      ],
      ABRIL,
      30,
    );

    expect(curva).toHaveLength(30);
    expect(curva[29]).toBe("1.00");
  });

  it("conta os gastos do primeiro e do último dia do mês, mas não o dia 0 nem o 31 de abril", () => {
    const curva = gastoAcumuladoPorDia(
      [
        { data: "2026-04-01", valor: "1.00" },
        { data: "2026-04-30", valor: "2.00" },
        { data: "2026-04-31", valor: "4.00" },
        { data: "2026-04-00", valor: "8.00" },
      ],
      ABRIL,
      30,
    );

    expect(curva[0]).toBe("1.00");
    expect(curva[28]).toBe("1.00");
    expect(curva[29]).toBe("3.00");
  });

  it("gasto depois do dia pedido não entra", () => {
    expect(gastoAcumuladoPorDia([{ data: "2026-04-05", valor: "1.00" }], ABRIL, 4)).toEqual([
      "0.00",
      "0.00",
      "0.00",
      "0.00",
    ]);
  });

  it("não passa dos dias do mês nem devolve menos de zero dias", () => {
    expect(gastoAcumuladoPorDia([], ABRIL, 99)).toHaveLength(30);
    expect(gastoAcumuladoPorDia([], ABRIL, 0)).toEqual([]);
  });
});

describe("ritmoIdealPorDia", () => {
  it("distribui a renda pelos dias, em centavos, para baixo", () => {
    const ritmo = ritmoIdealPorDia("1000.10", ABRIL);

    expect(ritmo).toHaveLength(30);
    expect(ritmo?.[0]).toBe("33.33");
    expect(ritmo?.[29]).toBe("1000.10");
  });

  it("em fevereiro bissexto divide por 29 dias", () => {
    const ritmo = ritmoIdealPorDia("29.00", { ano: 2028, mes: 2 }) ?? [];

    expect(ritmo).toHaveLength(29);
    expect(ritmo[0]).toBe("1.00");
    expect(ritmo[28]).toBe("29.00");
  });

  it("nunca passa da renda e nunca diminui", () => {
    const ritmo = ritmoIdealPorDia("1000.10", ABRIL) ?? [];
    const renda = 100010n;

    for (let i = 0; i < ritmo.length; i++) {
      expect(BigInt(ritmo[i].replace(".", "")) <= renda).toBe(true);
      if (i > 0) expect(BigInt(ritmo[i].replace(".", "")) >= BigInt(ritmo[i - 1].replace(".", ""))).toBe(true);
    }
  });

  it("devolve undefined sem renda", () => {
    expect(ritmoIdealPorDia("0.00", ABRIL)).toBeUndefined();
  });
});

describe("escalaDeValores", () => {
  it.each([
    ["0.00", "100.00"],
    ["99.99", "100.00"],
    ["100.00", "100.00"],
    ["100.01", "200.00"],
    ["350.00", "500.00"],
    ["500.01", "1000.00"],
    ["1000.01", "2000.00"],
    ["7300.00", "10000.00"],
    ["1000.00", "1000.00"],
    ["10000.00", "10000.00"],
    ["-5.00", "100.00"],
    ["999999999999.99", "1000000000000.00"],
  ])("o teto de %s é %s", (maximo, teto) => {
    expect(escalaDeValores(maximo).teto).toBe(teto);
  });

  it("devolve marcas crescentes de zero ao teto", () => {
    const { teto, marcas } = escalaDeValores("350.00");

    expect(marcas[0]).toBe("0.00");
    expect(marcas[marcas.length - 1]).toBe(teto);
    for (let i = 1; i < marcas.length; i++) {
      expect(BigInt(marcas[i].replace(".", "")) > BigInt(marcas[i - 1].replace(".", ""))).toBe(true);
    }
  });
});

describe("rotuloCompacto", () => {
  it("abrevia os valores", () => {
    expect(rotuloCompacto("0.00")).toBe("R$\u{a0}0");
    expect(rotuloCompacto("500.00")).toBe("R$\u{a0}500");
    expect(rotuloCompacto("1500.00")).toBe("R$\u{a0}1,5\u{a0}mil");
    expect(rotuloCompacto("12000.00")).toBe("R$\u{a0}12\u{a0}mil");
    expect(rotuloCompacto("1000000.00")).toBe("R$\u{a0}1\u{a0}mi");
    expect(rotuloCompacto("999.99")).toBe("R$\u{a0}999");
    expect(rotuloCompacto("1000.00")).toBe("R$\u{a0}1\u{a0}mil");
    expect(rotuloCompacto("-1500.00")).toBe("-R$\u{a0}1,5\u{a0}mil");
  });
});

describe("razaoDe", () => {
  it("calcula a fração e é zero com total zero", () => {
    expect(razaoDe("25.00", "100.00")).toBe(0.25);
    expect(razaoDe("5.00", "0.00")).toBe(0);
  });

  it("continua exata com centavos acima de 2^53", () => {
    const total = "90071992547409.93";
    expect(razaoDe(total, total)).toBe(1);
    // Um centavo a menos que o total: com `Number` sobre centavos arredondaria para 1.
    expect(razaoDe("90071992547409.92", total)).toBe(0.999999);
    expect(razaoDe("45035996273704.96", "90071992547409.92")).toBe(0.5);
  });
});
