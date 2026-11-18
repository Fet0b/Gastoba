import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Chip } from "./Chip";

describe("Chip", () => {
  it("aria-pressed segue selecionado", () => {
    const { rerender } = render(
      <Chip selecionado={false} aoAlternar={() => {}}>
        Lazer
      </Chip>,
    );
    expect(screen.getByRole("button", { name: "Lazer" }).getAttribute("aria-pressed")).toBe("false");

    rerender(
      <Chip selecionado aoAlternar={() => {}}>
        Lazer
      </Chip>,
    );
    expect(screen.getByRole("button", { name: "Lazer" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("o tamanho pequeno (linhas de lista) é marcado em data-tamanho; o padrão não tem a marca", () => {
    const { rerender } = render(
      <Chip selecionado={false} aoAlternar={() => {}} tamanho="pequeno">
        Lazer
      </Chip>,
    );
    expect(screen.getByRole("button", { name: "Lazer" }).getAttribute("data-tamanho")).toBe("pequeno");
    rerender(
      <Chip selecionado={false} aoAlternar={() => {}}>
        Lazer
      </Chip>,
    );
    expect(screen.getByRole("button", { name: "Lazer" }).hasAttribute("data-tamanho")).toBe(false);
  });

  it("o clique chama aoAlternar", () => {
    const aoAlternar = vi.fn();
    render(
      <Chip selecionado={false} aoAlternar={aoAlternar}>
        Lazer
      </Chip>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(aoAlternar).toHaveBeenCalledTimes(1);
  });

  it("selecionado mostra o ✓ escondido dos leitores; não selecionado não", () => {
    const { container, rerender } = render(
      <Chip selecionado aoAlternar={() => {}}>
        Lazer
      </Chip>,
    );
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");

    rerender(
      <Chip selecionado={false} aoAlternar={() => {}}>
        Lazer
      </Chip>,
    );
    expect(container.querySelector("svg")).toBeNull();
  });

  it("a cor desenha a bolinha", () => {
    const { container } = render(
      <Chip selecionado={false} aoAlternar={() => {}} cor="#ff0000">
        Lazer
      </Chip>,
    );
    const ponto = container.querySelector("[data-ponto]") as HTMLElement;

    expect(ponto.style.backgroundColor).toBe("rgb(255, 0, 0)");
  });

  it("sem cor não há bolinha; repassa aria-label e ref", () => {
    const ref = createRef<HTMLButtonElement>();
    const { container } = render(
      <Chip selecionado={false} aoAlternar={() => {}} aria-label="Filtrar por Lazer" ref={ref}>
        Lazer
      </Chip>,
    );

    expect(container.querySelector("[data-ponto]")).toBeNull();
    expect(ref.current).toBe(screen.getByRole("button", { name: "Filtrar por Lazer" }));
  });
});
