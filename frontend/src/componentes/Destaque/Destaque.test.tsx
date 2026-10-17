import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Destaque } from "./Destaque";

describe("Destaque", () => {
  it("mostra o rótulo e o valor e nomeia o grupo com os dois", () => {
    render(<Destaque rotulo="Saldo do mês" valor="R$ 1.234,56" />);
    const grupo = screen.getByRole("group", { name: "Saldo do mês: R$ 1.234,56" });

    expect(grupo.textContent).toContain("Saldo do mês");
    expect(grupo.textContent).toContain("R$ 1.234,56");
  });

  it("o valor não usa algarismos tabulares (classe .valor global ausente)", () => {
    const { container } = render(<Destaque rotulo="Total" valor="R$ 10,00" />);

    expect(container.querySelector(".valor")).toBeNull();
  });

  it("o tom neutro é o padrão e não traz símbolo", () => {
    const { container } = render(<Destaque rotulo="Total" valor="R$ 10,00" />);

    expect(container.firstElementChild?.getAttribute("data-tom")).toBe("neutro");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("o tom positivo traz ícone e palavra, nunca só a cor", () => {
    const { container } = render(<Destaque rotulo="Sobrou" valor="R$ 10,00" tom="positivo" />);
    const grupo = screen.getByRole("group");

    expect(grupo.getAttribute("data-tom")).toBe("positivo");
    expect(container.querySelector("svg")).not.toBeNull();
    expect(grupo.getAttribute("aria-label")).toBe("Sobrou: R$ 10,00, positivo");
    expect(grupo.textContent).toContain("Positivo");
  });

  it("o tom negativo traz ícone e palavra", () => {
    const { container } = render(<Destaque rotulo="Faltou" valor="R$ 10,00" tom="negativo" />);
    const grupo = screen.getByRole("group");

    expect(grupo.getAttribute("data-tom")).toBe("negativo");
    expect(container.querySelector("svg")).not.toBeNull();
    expect(grupo.getAttribute("aria-label")).toBe("Faltou: R$ 10,00, negativo");
    expect(grupo.textContent).toContain("Negativo");
  });
});
