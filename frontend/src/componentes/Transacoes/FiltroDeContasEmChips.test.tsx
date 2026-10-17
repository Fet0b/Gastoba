import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Conta } from "../../api/tipos";
import { FiltroDeContasEmChips } from "./FiltroDeContasEmChips";

const CONTAS: Conta[] = [
  { id: "c1", nome: "Carteira", saldo: "10.00", origem: "manual", tipo: "corrente" },
  { id: "c2", nome: "Nubank", saldo: "20.00", origem: "manual", tipo: "corrente" },
];

function grupo(): HTMLElement {
  return screen.getByRole("group", { name: "Filtrar por conta" });
}

describe("FiltroDeContasEmChips", () => {
  it("mostra Todas as contas e um chip por conta; só o ativo fica pressionado", () => {
    render(<FiltroDeContasEmChips contas={CONTAS} ativa="c2" aoMudar={vi.fn()} />);

    const botoes = within(grupo()).getAllByRole("button");
    expect(botoes.map((b) => b.textContent)).toEqual(["Todas as contas", "Carteira", "Nubank"]);
    expect(botoes.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false", "true"]);
  });

  it("sem conta ativa, Todas as contas fica pressionado", () => {
    render(<FiltroDeContasEmChips contas={CONTAS} ativa={null} aoMudar={vi.fn()} />);

    expect(
      within(grupo()).getByRole("button", { name: "Todas as contas" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("clicar numa conta chama aoMudar com o id; clicar na ativa ou em Todas chama com null", () => {
    const aoMudar = vi.fn();
    render(<FiltroDeContasEmChips contas={CONTAS} ativa="c2" aoMudar={aoMudar} />);

    fireEvent.click(within(grupo()).getByRole("button", { name: "Carteira" }));
    expect(aoMudar).toHaveBeenLastCalledWith("c1");
    fireEvent.click(within(grupo()).getByRole("button", { name: "Nubank" }));
    expect(aoMudar).toHaveBeenLastCalledWith(null);
    fireEvent.click(within(grupo()).getByRole("button", { name: "Todas as contas" }));
    expect(aoMudar).toHaveBeenLastCalledWith(null);
  });

  it("sem contas carregadas, mostra só Todas as contas", () => {
    render(<FiltroDeContasEmChips contas={undefined} ativa={null} aoMudar={vi.fn()} />);

    expect(within(grupo()).getAllByRole("button")).toHaveLength(1);
  });
});
