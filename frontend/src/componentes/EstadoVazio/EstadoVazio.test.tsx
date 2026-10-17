import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EstadoVazio } from "./EstadoVazio";

describe("EstadoVazio", () => {
  it("mostra o título e o texto, com o ícone escondido dos leitores de tela", () => {
    const { container } = render(
      <EstadoVazio icone="transacoes" titulo="Nenhum gasto" texto="Registre o primeiro." />,
    );

    expect(screen.getByText("Nenhum gasto")).not.toBeNull();
    expect(screen.getByText("Registre o primeiro.")).not.toBeNull();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("sem texto só o título é parágrafo", () => {
    const { container } = render(<EstadoVazio icone="tags" titulo="Sem tags" />);

    expect(container.querySelectorAll("p")).toHaveLength(1);
  });

  it("a ação é um botão de verdade que chama o callback", () => {
    const aoClicar = vi.fn();
    render(
      <EstadoVazio icone="contas" titulo="Sem contas" acao={{ rotulo: "Criar conta", aoClicar }} />,
    );
    const botao = screen.getByRole("button", { name: "Criar conta" });

    expect(botao.getAttribute("type")).toBe("button");
    fireEvent.click(botao);
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });
});
