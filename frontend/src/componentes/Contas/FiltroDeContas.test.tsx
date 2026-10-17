import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Conta } from "../../api/tipos";
import { FiltroDeContas } from "./FiltroDeContas";

const CONTAS: Conta[] = [
  { id: "c1", nome: "Carteira", saldo: "10.00", origem: "manual", tipo: "corrente" },
  { id: "c2", nome: "Nubank", saldo: "20.00", origem: "manual", tipo: "corrente" },
];

describe("FiltroDeContas", () => {
  it("lista Todas as contas e uma opção por conta", () => {
    render(<FiltroDeContas contas={CONTAS} ativa={null} aoMudar={vi.fn()} />);

    const seletor = screen.getByLabelText("Conta") as HTMLSelectElement;
    expect([...seletor.options].map((o) => o.textContent)).toEqual([
      "Todas as contas",
      "Carteira",
      "Nubank",
    ]);
    expect(seletor.value).toBe("");
  });

  it("escolher uma conta chama aoMudar com o id e Todas as contas com null", () => {
    const aoMudar = vi.fn();
    const { rerender } = render(<FiltroDeContas contas={CONTAS} ativa={null} aoMudar={aoMudar} />);

    fireEvent.change(screen.getByLabelText("Conta"), { target: { value: "c2" } });
    expect(aoMudar).toHaveBeenLastCalledWith("c2");

    rerender(<FiltroDeContas contas={CONTAS} ativa="c2" aoMudar={aoMudar} />);
    expect((screen.getByLabelText("Conta") as HTMLSelectElement).value).toBe("c2");
    fireEvent.change(screen.getByLabelText("Conta"), { target: { value: "" } });
    expect(aoMudar).toHaveBeenLastCalledWith(null);
  });

  it("sem contas carregadas mostra só Todas as contas", () => {
    render(<FiltroDeContas contas={undefined} ativa={null} aoMudar={vi.fn()} />);
    expect((screen.getByLabelText("Conta") as HTMLSelectElement).options).toHaveLength(1);
  });
});
