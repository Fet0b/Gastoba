import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Icone } from "../Icone/Icone";
import { IconeDeCategoria } from "./IconeDeCategoria";

describe("IconeDeCategoria", () => {
  it("desenha o ícone da categoria, decorativo, na cor dela", () => {
    const { container } = render(<IconeDeCategoria categoria="lazer" />);

    const circulo = container.querySelector("[data-categoria='lazer']") as HTMLElement;
    expect(circulo).not.toBeNull();
    expect(circulo.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(circulo.style.getPropertyValue("--cor-da-categoria")).toBe("#E879F9");
  });

  it("uma categoria desconhecida cai num ícone genérico, sem quebrar", () => {
    const { container } = render(<IconeDeCategoria categoria="inventada" />);

    const circulo = container.querySelector("[data-categoria='inventada']") as HTMLElement;
    expect(circulo.querySelector("svg")).not.toBeNull();
    // É o ícone "outros" (e não o de uma categoria conhecida), também para nomes herdados do objeto.
    const outros = render(<Icone nome="outros" tamanho={18} />).container.querySelector("svg");
    const lazer = render(<IconeDeCategoria categoria="lazer" />).container.querySelector("svg");
    expect(circulo.querySelector("svg")?.innerHTML).toBe(outros?.innerHTML);
    expect(circulo.querySelector("svg")?.innerHTML).not.toBe(lazer?.innerHTML);
    const herdado = render(<IconeDeCategoria categoria="constructor" />).container.querySelector("svg");
    expect(herdado?.innerHTML).toBe(outros?.innerHTML);
  });

  it("a entrada usa o ícone de entrada", () => {
    const { container } = render(<IconeDeCategoria categoria={null} />);

    expect(container.querySelector("[data-sentido='entrada']")?.querySelector("svg")).not.toBeNull();
  });
});
