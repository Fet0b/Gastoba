import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EstadoVazio } from "./EstadoVazio";

describe("EstadoVazio", () => {
  it("mostra só o título, com o ícone escondido dos leitores de tela", () => {
    const { container } = render(<EstadoVazio icone="transacoes" titulo="Nenhum gasto" />);

    expect(screen.getByText("Nenhum gasto")).not.toBeNull();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a ação é um Botao secundário por padrão e chama o callback", () => {
    const aoClicar = vi.fn();
    render(
      <EstadoVazio icone="contas" titulo="Sem contas" acao={{ rotulo: "Criar conta", aoClicar }} />,
    );
    const botao = screen.getByRole("button", { name: "Criar conta" });

    expect(botao.getAttribute("type")).toBe("button");
    expect(botao.getAttribute("data-variante")).toBe("secundario");
    fireEvent.click(botao);
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });

  it("a ação aceita a variante primária", () => {
    render(
      <EstadoVazio
        icone="contas"
        titulo="Sem contas"
        acao={{ rotulo: "Criar conta", aoClicar: () => {}, variante: "primario" }}
      />,
    );

    expect(screen.getByRole("button", { name: "Criar conta" }).getAttribute("data-variante")).toBe(
      "primario",
    );
  });
});
