import { render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { Olho } from "./Olho";

function svgDe(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector("svg");
  if (!svg) throw new Error("O olho não renderizou um <svg>.");
  return svg;
}

describe("Olho", () => {
  it("fora do cabeçalho é uma imagem com o nome Gastoba", () => {
    const { container } = render(<Olho />);
    const svg = svgDe(container);

    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Gastoba");
    expect(svg.hasAttribute("aria-hidden")).toBe(false);
  });

  it("decorativo fica escondido dos leitores de tela, sem papel nem rótulo", () => {
    const { container } = render(<Olho decorativo />);
    const svg = svgDe(container);

    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.hasAttribute("role")).toBe(false);
    expect(svg.hasAttribute("aria-label")).toBe(false);
  });

  it("expõe o estado em data-estado, normal por padrão", () => {
    const { container, rerender } = render(<Olho />);
    expect(svgDe(container).getAttribute("data-estado")).toBe("normal");

    rerender(<Olho estado="confirmando" />);
    expect(svgDe(container).getAttribute("data-estado")).toBe("confirmando");

    rerender(<Olho estado="erro" />);
    expect(svgDe(container).getAttribute("data-estado")).toBe("erro");
  });

  it("dois olhos na tela não repetem ids e cada um referencia os próprios", () => {
    const { container } = render(
      <>
        <Olho />
        <Olho decorativo />
      </>,
    );

    const ids = [...container.querySelectorAll("[id]")].map((elemento) => elemento.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);

    for (const svg of container.querySelectorAll("svg")) {
      const idsDoSvg = new Set([...svg.querySelectorAll("[id]")].map((elemento) => elemento.id));
      const referencias = [...svg.querySelectorAll("*")].flatMap((elemento) =>
        // `href="#id"` e `url(#id)` (cores como `fill="#0C0814"` não contam).
        [...elemento.attributes]
          .map((atributo) =>
            atributo.name === "href"
              ? /^#(.+)$/.exec(atributo.value)
              : /url\(#(.+)\)/.exec(atributo.value),
          )
          .filter((casamento) => casamento !== null)
          .map((casamento) => casamento[1]),
      );
      expect(referencias.length).toBeGreaterThan(0);
      for (const referencia of referencias) expect(idsDoSvg.has(referencia)).toBe(true);
    }
  });

  it("entrega o <svg> pela ref, para o cabeçalho seguir o cursor", () => {
    const ref = createRef<SVGSVGElement>();
    render(<Olho ref={ref} decorativo />);

    expect(ref.current?.tagName.toLowerCase()).toBe("svg");
  });
});
