import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MarcaDoApp } from "../../api/tipos";
import { inicialDe, Marca } from "./Marca";

describe("Marca", () => {
  it("olho delega ao Olho e mantém o estado", () => {
    const { container } = render(<Marca marca="olho" nome="Gastoba" estadoDoOlho="erro" decorativo />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("data-estado")).toBe("erro");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it.each(["moeda", "cofre", "folha", "grafico"] as MarcaDoApp[])("%s desenha um ícone do conjunto", (marca) => {
    const { container } = render(<Marca marca={marca} nome="Meu app" decorativo />);
    expect(container.querySelector("[data-marca]")?.getAttribute("data-marca")).toBe(marca);
    expect(container.querySelectorAll("svg path").length).toBeGreaterThan(0);
  });

  it("inicial mostra a primeira letra do nome em maiúscula", () => {
    const { container } = render(<Marca marca="inicial" nome="  ótimo" decorativo />);
    expect(container.textContent).toBe("Ó");
    expect(inicialDe("")).toBe("?");
  });

  it("sem decorativo, a marca tem nome acessível igual ao nome do app", () => {
    const { getByRole } = render(<Marca marca="cofre" nome="Meu cofre" />);
    expect(getByRole("img", { name: "Meu cofre" })).not.toBeNull();
  });
});
