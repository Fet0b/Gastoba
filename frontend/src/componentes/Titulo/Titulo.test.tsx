import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Titulo } from "./Titulo";
it("permite hierarquia semântica independente da escala visual", () => { render(<Titulo nivel="pagina" como="h1">Contas</Titulo>); expect(screen.getByRole("heading", { level: 1, name: "Contas" }).getAttribute("data-nivel")).toBe("pagina"); });

describe("Titulo, classes do chamador (070 T015)", () => {
  it("mantém o nível e acrescenta a classe do chamador (só para margem e posição)", () => {
    const { container } = render(<Titulo nivel="secao" className="de-fora">Seção</Titulo>);
    const titulo = container.querySelector("h2")!;
    expect(titulo.getAttribute("data-nivel")).toBe("secao");
    expect(titulo.classList.contains("de-fora")).toBe(true);
  });
});
