import { describe, expect, it } from "vitest";

import type { Conta } from "../api/tipos";
import { dinheiroTotalDasContas } from "./dinheiroTotal";

function conta(nome: string, saldo: string, tipo: Conta["tipo"], origem: Conta["origem"]): Conta {
  return { id: nome, nome, saldo, origem, tipo };
}

describe("dinheiroTotalDasContas", () => {
  it("soma só as contas correntes, importadas ou manuais; o cartão fica de fora", () => {
    const contas = [
      conta("Banco", "100.00", "corrente", "open_finance"),
      conta("Carteira", "50.50", "corrente", "manual"),
      conta("Cartão", "-300.00", "cartao", "open_finance"),
    ];

    expect(dinheiroTotalDasContas(contas)).toBe("150.50");
  });

  it("sem contas correntes o total é zero", () => {
    expect(dinheiroTotalDasContas([conta("Cartão", "-300.00", "cartao", "open_finance")])).toBe("0.00");
    expect(dinheiroTotalDasContas([])).toBe("0.00");
  });

  it("enquanto as contas não chegaram, não há total", () => {
    expect(dinheiroTotalDasContas(undefined)).toBeUndefined();
  });
});
