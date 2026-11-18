import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Botao } from "./Botao";

describe("Botao", () => {
  it.each([
    ["primario", "principal"],
    ["secundario", "secundaria"],
    ["terciario", "terciaria"],
    ["destrutivo", "destrutiva"],
  ] as const)("a variante %s emite data-variante e data-papel %s", (variante, papel) => {
    render(<Botao variante={variante}>Ação</Botao>);
    const botao = screen.getByRole("button", { name: "Ação" });

    expect(botao.getAttribute("data-variante")).toBe(variante);
    expect(botao.getAttribute("data-papel")).toBe(papel);
  });

  it("o type padrão é button e repassa submit", () => {
    const { rerender } = render(<Botao variante="primario">A</Botao>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");

    rerender(
      <Botao variante="primario" type="submit">
        A
      </Botao>,
    );
    expect(screen.getByRole("button").getAttribute("type")).toBe("submit");
  });

  it("desabilitado repassa disabled e não dispara onClick", () => {
    const aoClicar = vi.fn();
    render(
      <Botao variante="secundario" disabled onClick={aoClicar}>
        A
      </Botao>,
    );
    const botao = screen.getByRole("button") as HTMLButtonElement;

    expect(botao.disabled).toBe(true);
    fireEvent.click(botao);
    expect(aoClicar).not.toHaveBeenCalled();
  });

  it("habilitado dispara onClick", () => {
    const aoClicar = vi.fn();
    render(
      <Botao variante="secundario" onClick={aoClicar}>
        A
      </Botao>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });

  it("a ref aponta para o <button>", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Botao variante="primario" ref={ref}>
        A
      </Botao>,
    );
    expect(ref.current).toBe(screen.getByRole("button"));
  });

  it("a seta acrescenta → escondido dos leitores de tela", () => {
    render(
      <Botao variante="terciario" seta>
        Ver orçamento
      </Botao>,
    );
    const seta = screen.getByRole("button").querySelector("[data-seta]");

    expect(seta?.textContent).toBe("→");
    expect(seta?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("button", { name: "Ver orçamento" })).not.toBeNull();
  });

  it("o ícone é decorativo", () => {
    render(
      <Botao variante="secundario" icone="adicionar">
        Nova conta
      </Botao>,
    );
    const svg = screen.getByRole("button").querySelector("svg");

    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("button", { name: "Nova conta" })).not.toBeNull();
  });

  it("repassa aria-label", () => {
    render(
      <Botao variante="terciario" aria-label="Ver lançamentos de Lazer">
        Lazer
      </Botao>,
    );
    expect(screen.getByRole("button", { name: "Ver lançamentos de Lazer" })).not.toBeNull();
  });
});
