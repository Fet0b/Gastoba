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
      aportes="0.00"
      dinheiroTotal="150.50"
      momento="atual"
      hoje="2026-11-09"
      periodo={{ ano: 2026, mes: 11 }}
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

    const dinheiro = screen.getByRole("group", { name: "Dinheiro nas contas correntes" });
    expect(dinheiro.textContent).toContain(`R$${NBSP}150,50`);
  });

  it("tem um só herói (Pode gastar) e o dinheiro nas contas correntes em tamanho médio", () => {
    const { container } = render(
      <ResumoDoMes renda="100.00" gasto="10.00" dinheiroTotal="5.00" momento="atual" hoje="2026-11-09" periodo={{ ano: 2026, mes: 11 }} aoRegistrarGanho={() => {}} />,
    );

    expect(container.querySelectorAll('[data-tamanho="heroi"]')).toHaveLength(1);
    expect(screen.getByRole("group", { name: /^Pode gastar este mês/ }).getAttribute("data-tamanho")).toBe("heroi");
    expect(screen.getByRole("group", { name: "Dinheiro nas contas correntes" })).toBeTruthy();
    expect(screen.queryByText("Dinheiro total")).toBeNull();
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
    const botao = screen.getByRole("button", { name: "Registrar um ganho" });
    expect(botao.getAttribute("data-papel")).toBe("secundaria");
    fireEvent.click(botao);
    expect(aoRegistrarGanho).toHaveBeenCalledTimes(1);
  });

  it("mês futuro sem ganhos também é Gasto no mês, e o dinheiro total continua", () => {
    desenhar({ renda: "0.00", gasto: "0.00", momento: "futuro" });

    expect(screen.getByRole("group", { name: `Gasto no mês: R$${NBSP}0,00` })).not.toBeNull();
    expect(screen.getByRole("group", { name: "Dinheiro nas contas correntes" })).not.toBeNull();
  });

  it("enquanto os dados não chegam, mostra um traço", () => {
    desenhar({ renda: undefined, gasto: undefined, dinheiroTotal: undefined });

    expect(screen.getByRole("group", { name: "Pode gastar este mês: —" })).not.toBeNull();
    expect(screen.getByRole("group", { name: "Dinheiro nas contas correntes" })).not.toBeNull();
  });
});

it("desconta só aportes com dinheiro novo e abre a conta", () => {
  render(<ResumoDoMes renda="5387.04" gasto="284.87" aportes="2811.88" dinheiroTotal="0.00" momento="atual" hoje="2026-11-09" periodo={{ ano: 2026, mes: 11 }} aoRegistrarGanho={() => {}} />);
  expect(screen.getByText(/2.290,29/)).toBeTruthy();
  expect(screen.getByText("Aportes com dinheiro do mês")).toBeTruthy();
  const nota = screen.getByText("Aportes que só reaplicam resgates não entram na conta.");
  expect(nota.closest('[role="group"]')?.getAttribute("aria-label")).toBe("Aportes com dinheiro do mês");
  expect(screen.getByRole("group", { name: "Dinheiro nas contas correntes" }).querySelector('[data-parte="nota"]')?.getAttribute("data-vazia")).toBe("true");
});
