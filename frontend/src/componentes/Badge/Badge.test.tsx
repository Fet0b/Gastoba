import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./Badge";

describe("Badge", () => {
  it("renderiza um span com data-badge e tom neutro por padrão", () => {
    const { container } = render(<Badge>Recorrente</Badge>);
    const badge = container.querySelector("[data-badge]");

    expect(badge?.tagName).toBe("SPAN");
    expect(badge?.getAttribute("data-tom")).toBe("neutro");
    expect(badge?.textContent).toBe("Recorrente");
  });

  it.each(["positivo", "negativo", "atencao"] as const)("repassa o tom %s", (tom) => {
    const { container } = render(<Badge tom={tom}>X</Badge>);
    expect(container.querySelector("[data-badge]")?.getAttribute("data-tom")).toBe(tom);
  });

  it("não é interativo", () => {
    const { container } = render(<Badge>Banco conectado</Badge>);
    const badge = container.querySelector("[data-badge]") as HTMLElement;

    expect(badge.hasAttribute("tabindex")).toBe(false);
    expect(badge.hasAttribute("role")).toBe(false);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("o ícone vem antes do texto", () => {
    const { container } = render(<Badge icone={<svg data-icone="" />}>Texto</Badge>);
    const badge = container.querySelector("[data-badge]") as HTMLElement;

    expect(badge.firstElementChild?.hasAttribute("data-icone")).toBe(true);
    expect(badge.textContent).toBe("Texto");
  });
});
