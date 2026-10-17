import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ResumoDoMes } from "./ResumoDoMes";

const NBSP = "\u{a0}";
const MENOS = "\u{2212}";

type Extras = Partial<Parameters<typeof ResumoDoMes>[0]>;

function desenhar(extras: Extras = {}) {
  const aoRegistrarGanho = vi.fn();
  render(
    <ResumoDoMes
      renda="1000.10"
      gasto="25.95"
      dinheiroTotal="150.50"
      momento="atual"
      aoRegistrarGanho={aoRegistrarGanho}
      {...extras}
    />,
  );
  return { aoRegistrarGanho };
}

describe("ResumoDoMes", () => {
  it("o destaque principal é a renda menos os gastos, em centavos exatos", () => {
    desenhar();

    const principal = screen.getByRole("group", { name: `Pode gastar este mês: R$${NBSP}974,15` });
    expect(principal.getAttribute("data-tom")).toBe("neutro");
  });

  it("o dinheiro total aparece ao lado", () => {
    desenhar();

    expect(screen.getByRole("group", { name: `Dinheiro total: R$${NBSP}150,50` })).not.toBeNull();
  });

  it("gastos acima da renda têm tom negativo, sinal de menos e a palavra Negativo", () => {
    desenhar({ renda: "100.00", gasto: "130.50" });

    const principal = screen.getByRole("group", { name: /^Pode gastar este mês/ });
    expect(principal.getAttribute("data-tom")).toBe("negativo");
    expect(principal.textContent).toContain(`${MENOS}R$${NBSP}30,50`);
    expect(principal.textContent).toContain("Negativo");
  });

  it("mês passado troca o rótulo para Sobrou no mês", () => {
    desenhar({ momento: "passado" });

    expect(screen.getByRole("group", { name: /^Sobrou no mês/ })).not.toBeNull();
    expect(screen.queryByText("Pode gastar este mês")).toBeNull();
  });

  it("sem ganhos vira Gasto no mês, convida a registrar um ganho e o botão chama a ação", () => {
    const { aoRegistrarGanho } = desenhar({ renda: "0.00", gasto: "25.90" });

    expect(screen.getByRole("group", { name: `Gasto no mês: R$${NBSP}25,90` })).not.toBeNull();
    expect(screen.queryByText("Pode gastar este mês")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Registrar um ganho" }));
    expect(aoRegistrarGanho).toHaveBeenCalledTimes(1);
  });

  it("mês futuro sem ganhos também é Gasto no mês, e o dinheiro total continua", () => {
    desenhar({ renda: "0.00", gasto: "0.00", momento: "futuro" });

    expect(screen.getByRole("group", { name: `Gasto no mês: R$${NBSP}0,00` })).not.toBeNull();
    expect(screen.getByRole("group", { name: /^Dinheiro total/ })).not.toBeNull();
  });

  it("enquanto os dados não chegam, mostra um traço", () => {
    desenhar({ renda: undefined, gasto: undefined, dinheiroTotal: undefined });

    expect(screen.getByRole("group", { name: "Pode gastar este mês: —" })).not.toBeNull();
    expect(screen.getByRole("group", { name: "Dinheiro total: —" })).not.toBeNull();
  });
});
