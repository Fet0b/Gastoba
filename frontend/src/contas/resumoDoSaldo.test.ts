import { describe, expect, it } from "vitest";

import { resumoDoSaldo } from "./resumoDoSaldo";

describe("resumoDoSaldo", () => {
  it("conta corrente positiva: Saldo neutro", () => {
    expect(resumoDoSaldo({ tipo: "corrente", saldo: "100.00" })).toEqual({
      rotulo: "Saldo",
      valor: "100.00",
      tom: "neutro",
      saldoNegativo: false,
    });
  });

  it("conta corrente zerada: Saldo neutro", () => {
    expect(resumoDoSaldo({ tipo: "corrente", saldo: "0.00" })).toMatchObject({
      rotulo: "Saldo",
      tom: "neutro",
      saldoNegativo: false,
    });
  });

  it("conta corrente negativa: tom negativo e saldoNegativo", () => {
    expect(resumoDoSaldo({ tipo: "corrente", saldo: "-10.00" })).toEqual({
      rotulo: "Saldo",
      valor: "-10.00",
      tom: "negativo",
      saldoNegativo: true,
    });
  });

  it("cartão com valor devido: Fatura aberta positiva e neutra", () => {
    expect(resumoDoSaldo({ tipo: "cartao", saldo: "-122.18" })).toEqual({
      rotulo: "Fatura aberta",
      valor: "122.18",
      tom: "neutro",
      saldoNegativo: false,
    });
  });

  it("cartão zerado: Fatura aberta 0.00 (sem sinal)", () => {
    expect(resumoDoSaldo({ tipo: "cartao", saldo: "0.00" })).toMatchObject({
      rotulo: "Fatura aberta",
      valor: "0.00",
      tom: "neutro",
    });
  });

  it("cartão com crédito a favor: Saldo a favor", () => {
    expect(resumoDoSaldo({ tipo: "cartao", saldo: "50.00" })).toEqual({
      rotulo: "Saldo a favor",
      valor: "50.00",
      tom: "neutro",
      saldoNegativo: false,
    });
  });

  it.each([
    ["aberta", "Fatura aberta"],
    ["fechada", "Fatura fechada"],
    ["vencida", "Fatura fechada"],
    ["paga", "Fatura fechada"],
  ] as const)("cartão com a fatura mais recente %s: rótulo '%s', sempre neutro", (situacao, rotulo) => {
    expect(resumoDoSaldo({ tipo: "cartao", saldo: "-122.18" }, situacao)).toEqual({
      rotulo,
      valor: "122.18",
      tom: "neutro",
      saldoNegativo: false,
    });
  });

  it("a situação não muda o saldo a favor nem a conta corrente negativa", () => {
    expect(resumoDoSaldo({ tipo: "cartao", saldo: "50.00" }, "fechada").rotulo).toBe("Saldo a favor");
    expect(resumoDoSaldo({ tipo: "corrente", saldo: "-10.00" }, "vencida")).toMatchObject({
      rotulo: "Saldo",
      tom: "negativo",
      saldoNegativo: true,
    });
  });
});
