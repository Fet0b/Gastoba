import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Cartao } from "./Cartao";

describe("Cartao", () => {
  it("renderiza os filhos numa section por padrão com a variante padrao", () => {
    const { container } = render(<Cartao>Conteúdo</Cartao>);
    const elemento = container.firstElementChild;

    expect(elemento?.tagName).toBe("SECTION");
    expect(elemento?.textContent).toBe("Conteúdo");
    expect(elemento?.getAttribute("data-variante")).toBe("padrao");
  });

  it.each(["section", "div", "article", "li"] as const)("aceita o elemento %s", (como) => {
    const { container } = render(
      como === "li" ? (
        <ul>
          <Cartao como={como}>x</Cartao>
        </ul>
      ) : (
        <Cartao como={como}>x</Cartao>
      ),
    );

    expect(container.querySelector(como)).not.toBeNull();
  });

  it("expõe a variante em data-variante", () => {
    const { container } = render(<Cartao variante="destaque">x</Cartao>);

    expect(container.firstElementChild?.getAttribute("data-variante")).toBe("destaque");
  });

  it("repassa o nome acessível e a classe extra", () => {
    const { container } = render(
      <Cartao aria-label="Resumo" className="extra">
        x
      </Cartao>,
    );
    const elemento = container.firstElementChild;

    expect(elemento?.getAttribute("aria-label")).toBe("Resumo");
    expect(elemento?.classList.contains("extra")).toBe(true);
  });
});
