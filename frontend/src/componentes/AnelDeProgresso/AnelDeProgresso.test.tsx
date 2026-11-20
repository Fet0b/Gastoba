import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { definirMidia } from "../../testes/preparar";
import { AnelDeProgresso } from "./AnelDeProgresso";

const BASE = {
  rotulo: "Lazer: 42% usado, R$ 423,00 de R$ 1.007,00",
  cor: "#8b5cf6",
} as const;

function anel() {
  return screen.getByRole("img", { name: /^Lazer: / });
}

function arco() {
  return anel().querySelector("[data-arco]") as SVGCircleElement;
}

function trilha() {
  return anel().querySelector("[data-trilha]") as SVGCircleElement;
}

describe("AnelDeProgresso", () => {
  it("é uma imagem com o rótulo completo e mostra a porcentagem usada no centro", () => {
    render(<AnelDeProgresso {...BASE} usado={42} situacao="dentro" />);

    expect(anel().getAttribute("aria-label")).toBe(BASE.rotulo);
    expect(anel().querySelector("[data-centro]")?.textContent).toBe("42%");
    expect(arco().getAttribute("stroke-dasharray")).toBe("42 100");
  });

  it("o trilho está sempre desenhado, também com 0% usado, e o arco vazio não desenha ponta", () => {
    render(<AnelDeProgresso {...BASE} usado={0} situacao="dentro" />);

    expect(trilha()).toBeTruthy();
    expect(anel().querySelector("[data-centro]")?.textContent).toBe("0%");
    expect(arco().getAttribute("stroke-dasharray")).toBe("0 100");
    expect(arco().getAttribute("stroke-linecap")).toBe("butt");
  });

  it("estourou preenche o anel inteiro e mostra a porcentagem real", () => {
    render(<AnelDeProgresso {...BASE} usado={116} situacao="estourou" />);

    expect(arco().getAttribute("stroke-dasharray")).toBe("100 100");
    expect(anel().querySelector("[data-centro]")?.textContent).toBe("116%");
    expect(anel().getAttribute("data-situacao")).toBe("estourou");
  });

  it("sem renda o arco fica vazio e o centro traz um travessão", () => {
    render(<AnelDeProgresso {...BASE} usado={null} situacao="sem_renda" />);

    expect(arco().getAttribute("stroke-dasharray")).toBe("0 100");
    expect(anel().querySelector("[data-centro]")?.textContent).toBe("–");
  });

  it("leva a cor da categoria e a descrição opcional", () => {
    render(<AnelDeProgresso {...BASE} usado={10} situacao="dentro" idDaDescricao="explicacao" />);

    expect(anel().style.getPropertyValue("--cor-do-anel")).toBe(BASE.cor);
    expect(anel().getAttribute("aria-describedby")).toBe("explicacao");
  });

  it("anima a entrada só com movimento permitido e algo a encher", () => {
    const { unmount } = render(<AnelDeProgresso {...BASE} usado={10} situacao="dentro" />);
    expect(anel().hasAttribute("data-animando")).toBe(true);
    unmount();

    render(<AnelDeProgresso {...BASE} usado={0} situacao="dentro" />);
    expect(anel().hasAttribute("data-animando")).toBe(false);
  });

  it("respeita prefers-reduced-motion", () => {
    definirMidia(true);
    render(<AnelDeProgresso {...BASE} usado={10} situacao="dentro" />);
    expect(anel().hasAttribute("data-animando")).toBe(false);
  });

  describe("rachurado (guardado para comprar)", () => {
    function rachurado() {
      return anel().querySelector("circle[data-rachurado]") as SVGCircleElement | null;
    }

    it("sem a prop, ou com zero, o DOM é o de sempre", () => {
      const { container, unmount } = render(<AnelDeProgresso {...BASE} usado={40} situacao="dentro" />);
      const semProp = container.innerHTML;
      expect(rachurado()).toBeNull();
      expect(anel().hasAttribute("data-rachurado")).toBe(false);
      expect(container.querySelector("pattern")).toBeNull();
      unmount();

      const { container: outro } = render(<AnelDeProgresso {...BASE} usado={40} situacao="dentro" rachurado={0} />);
      expect(outro.innerHTML).toBe(semProp);
    });

    it("desenha um terceiro círculo que começa onde o gasto termina", () => {
      render(<AnelDeProgresso {...BASE} usado={40} situacao="dentro" rachurado={30} />);
      const trecho = rachurado()!;
      expect(trecho.getAttribute("stroke-dasharray")).toBe("30 100");
      expect(trecho.getAttribute("stroke-dashoffset")).toBe("-40");
      expect(trecho.getAttribute("stroke-linecap")).toBe("butt");
      expect(trecho.getAttribute("stroke")).toMatch(/^url\(#.+\)$/);
      expect(anel().getAttribute("data-rachurado")).toBe("30");
      expect(arco().getAttribute("stroke-dasharray")).toBe("40 100");
    });

    it("o padrão de linhas existe no próprio SVG e o círculo aponta para ele", () => {
      render(<AnelDeProgresso {...BASE} usado={40} situacao="dentro" rachurado={30} />);
      const padrao = anel().querySelector("pattern")!;
      expect(padrao.id).not.toBe("");
      expect(rachurado()!.getAttribute("stroke")).toBe(`url(#${padrao.id})`);
    });

    it("limita ao que falta para fechar o anel", () => {
      render(<AnelDeProgresso {...BASE} usado={80} situacao="dentro" rachurado={50} />);
      expect(rachurado()!.getAttribute("stroke-dasharray")).toBe("20 100");
    });

    it("anel cheio ou estourado não tem espaço para o rachurado", () => {
      render(<AnelDeProgresso {...BASE} usado={116} situacao="estourou" rachurado={30} />);
      expect(rachurado()).toBeNull();
    });

    it("sem renda, o rachurado começa no zero", () => {
      render(<AnelDeProgresso {...BASE} usado={null} situacao="sem_renda" rachurado={20} />);
      expect(rachurado()!.getAttribute("stroke-dashoffset")).toBe("0");
    });

    it("anima a entrada só com movimento permitido", () => {
      const { unmount } = render(<AnelDeProgresso {...BASE} usado={0} situacao="dentro" rachurado={20} />);
      expect(anel().hasAttribute("data-animando")).toBe(true);
      unmount();

      definirMidia(true);
      render(<AnelDeProgresso {...BASE} usado={0} situacao="dentro" rachurado={20} />);
      expect(anel().hasAttribute("data-animando")).toBe(false);
    });
  });
});
