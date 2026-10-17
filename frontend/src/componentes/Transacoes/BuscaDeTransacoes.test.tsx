import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BuscaDeTransacoes } from "./BuscaDeTransacoes";

describe("BuscaDeTransacoes", () => {
  it("é um campo de busca com rótulo, que avisa a cada digitação", () => {
    const aoMudar = vi.fn();
    render(<BuscaDeTransacoes valor="" aoMudar={aoMudar} />);

    const campo = screen.getByLabelText("Buscar transações") as HTMLInputElement;
    expect(campo.type).toBe("search");
    fireEvent.change(campo, { target: { value: "mercado" } });
    expect(aoMudar).toHaveBeenCalledWith("mercado");
  });

  it("o botão Limpar busca só aparece com texto e esvazia o campo, devolvendo o foco a ele", () => {
    const aoMudar = vi.fn();
    const { rerender } = render(<BuscaDeTransacoes valor="" aoMudar={aoMudar} />);
    expect(screen.queryByRole("button", { name: "Limpar busca" })).toBeNull();

    rerender(<BuscaDeTransacoes valor="pix" aoMudar={aoMudar} />);
    fireEvent.click(screen.getByRole("button", { name: "Limpar busca" }));

    expect(aoMudar).toHaveBeenCalledWith("");
    expect(document.activeElement).toBe(screen.getByLabelText("Buscar transações"));
  });

  it("o ícone da lupa é decorativo", () => {
    const { container } = render(<BuscaDeTransacoes valor="" aoMudar={vi.fn()} />);

    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
