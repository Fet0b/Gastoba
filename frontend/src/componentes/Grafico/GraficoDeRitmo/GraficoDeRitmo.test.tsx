import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ritmoIdealPorDia } from "../../../graficos/ritmo";
import { definirMidia } from "../../../testes/preparar";
import { GraficoDeRitmo } from "./GraficoDeRitmo";

const NBSP = "\u{a0}";
const OUTUBRO = { ano: 2026, mes: 10 };
const ACUMULADO = ["0.00", "25.90", "25.90", "30.00", "30.00"];
const IDEAL = ritmoIdealPorDia("310.00", OUTUBRO);

type Extras = { acumulado?: string[]; ideal?: string[] | undefined; mesFuturo?: boolean };

function desenhar(extras: Extras = {}) {
  return render(
    <GraficoDeRitmo
      periodo={OUTUBRO}
      acumulado={extras.acumulado ?? ACUMULADO}
      ideal={"ideal" in extras ? extras.ideal : IDEAL}
      mesFuturo={extras.mesFuturo ?? false}
    />,
  );
}

function grafico(): SVGElement {
  return screen.getByRole("img", { name: /^Gasto acumulado/ }) as unknown as SVGElement;
}

function vivo(container: HTMLElement): string {
  return container.querySelector("[aria-live='polite']")?.textContent ?? "";
}

describe("GraficoDeRitmo", () => {
  it("desenha um SVG com rótulo que cita o acumulado e o estado", () => {
    desenhar();

    const nome = grafico().getAttribute("aria-label") ?? "";
    expect(nome).toContain(`R$${NBSP}30,00`);
    expect(nome).toContain("Dentro do ritmo");
  });

  it("mostra a legenda com as duas séries", () => {
    const { container } = desenhar();

    const legenda = container.querySelector("ul")!;
    expect(within(legenda).getByText("Gasto acumulado")).toBeTruthy();
    expect(within(legenda).getByText("Ritmo ideal")).toBeTruthy();
  });

  it("tem uma só marca de rótulo direto, no último ponto", () => {
    const { container } = desenhar();

    expect(container.querySelectorAll("[data-marca='final']")).toHaveLength(1);
    expect(container.querySelector("text[data-rotulo='final']")?.textContent).toBe(`R$${NBSP}30,00`);
  });

  it("sem renda não há a série ideal, nem a entrada na legenda, e o texto explica", () => {
    const { container } = desenhar({ ideal: undefined });

    expect(container.querySelector("[data-serie='ideal']")).toBeNull();
    expect(screen.queryByText("Ritmo ideal")).toBeNull();
    expect(container.textContent).toContain("não há ritmo ideal");
  });

  it("diz em texto, com ícone, quando está acima do ritmo", () => {
    const { container } = desenhar({ acumulado: ["60.00", "60.00"] });

    const estado = container.querySelector("[data-estado]")!;
    expect(estado.getAttribute("data-estado")).toBe("acima");
    expect(estado.textContent).toContain(`Acima do ritmo: R$${NBSP}40,00 a mais que o ideal até hoje`);
    expect(estado.querySelector("svg")).not.toBeNull();
  });

  it("diz em texto quando está dentro do ritmo", () => {
    const { container } = desenhar();

    const estado = container.querySelector("[data-estado]")!;
    expect(estado.getAttribute("data-estado")).toBe("dentro");
    expect(estado.textContent).toContain(`Dentro do ritmo: R$${NBSP}20,00 abaixo do ideal até hoje`);
  });

  it("move o dia com as setas e anuncia na região aria-live", () => {
    const { container } = desenhar();
    const svg = grafico();

    fireEvent.focus(svg);
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    fireEvent.keyDown(svg, { key: "ArrowRight" });

    expect(vivo(container)).toBe(
      `dia 4, gasto acumulado R$${NBSP}30,00, ritmo ideal R$${NBSP}40,00`,
    );
    expect(container.querySelector("[role='tooltip']")?.textContent).toContain(`R$${NBSP}30,00`);
  });

  it("Home vai ao primeiro dia, End ao último e Esc dispensa", () => {
    const { container } = desenhar();
    const svg = grafico();

    fireEvent.keyDown(svg, { key: "Home" });
    expect(vivo(container)).toContain("dia 1,");
    fireEvent.keyDown(svg, { key: "End" });
    expect(vivo(container)).toContain("dia 5,");
    fireEvent.keyDown(svg, { key: "Escape" });
    expect(vivo(container)).toBe("");
    expect(container.querySelector("[role='tooltip']")).toBeNull();
  });

  it("o ponteiro encaixa no dia mais próximo e mostra o tooltip (toque também)", () => {
    const { container } = desenhar();
    const area = container.querySelector("[data-area-sensivel]")!;

    const tooltip = () => container.querySelector("[role='tooltip']")?.textContent ?? "";

    fireEvent.pointerMove(area, { clientX: 0 });
    expect(tooltip()).toContain("Dia 1");

    fireEvent.pointerMove(area, { clientX: 100000 });
    expect(tooltip()).toContain("Dia 5");
    expect(tooltip()).toContain(`Gasto acumulado: R$${NBSP}30,00`);
    expect(tooltip()).toContain(`Ritmo ideal: R$${NBSP}50,00`);
    // seguir o ponteiro não fala no leitor de tela
    expect(vivo(container)).toBe("");

    fireEvent.pointerDown(area, { clientX: 0 });
    expect(tooltip()).toContain("Dia 1");

    fireEvent.pointerLeave(area);
    expect(container.querySelector("[role='tooltip']")).toBeNull();
  });

  it("o foco por teclado anuncia o último dia; sair do foco limpa", () => {
    const { container } = desenhar();
    const svg = grafico();

    fireEvent.focus(svg);
    expect(vivo(container)).toContain("dia 5,");
    fireEvent.blur(svg);
    expect(vivo(container)).toBe("");
    expect(container.querySelector("[role='tooltip']")).toBeNull();
  });

  it("as setas não passam do dia 1 nem do último dia e não rolam a página", () => {
    const { container } = desenhar();
    const svg = grafico();

    fireEvent.keyDown(svg, { key: "End" });
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(vivo(container)).toContain("dia 5,");
    fireEvent.keyDown(svg, { key: "Home" });
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    expect(vivo(container)).toContain("dia 1,");

    expect(fireEvent.keyDown(svg, { key: "ArrowRight" })).toBe(false);
    expect(fireEvent.keyDown(svg, { key: "a" })).toBe(true);
    expect(svg.getAttribute("tabindex")).toBe("0");
  });

  it("com o mês inteiro, o texto de estado diz 'no mês'", () => {
    const { container } = desenhar({ acumulado: Array(31).fill("30.00") });

    expect(container.querySelector("[data-estado]")?.textContent).toContain("no mês");
  });

  it("a tabela em <details> tem uma linha por dia com os mesmos valores", () => {
    const { container } = desenhar();

    const detalhes = container.querySelector("details")!;
    expect(detalhes.querySelector("summary")?.textContent).toBe("Ver como tabela");
    expect(detalhes.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(detalhes.textContent).toContain(`R$${NBSP}25,90`);
    expect(detalhes.textContent).toContain(`R$${NBSP}40,00`);
  });

  it("desenha a linha animada, e sem movimento ela aparece pronta", () => {
    const { container, unmount } = desenhar();
    expect(container.querySelector("[data-serie='acumulado']")?.getAttribute("data-animando")).toBe("true");
    unmount();

    definirMidia(true);
    const reduzido = desenhar();
    expect(reduzido.container.querySelector("[data-serie='acumulado']")?.hasAttribute("data-animando")).toBe(false);
    definirMidia(false);
  });

  it("no primeiro dia desenha só o ponto, sem quebrar", () => {
    const { container } = desenhar({ acumulado: ["10.00"] });

    expect(container.querySelectorAll("[data-marca='final']")).toHaveLength(1);
    expect(container.querySelector("details tbody")?.children).toHaveLength(1);
  });

  it("mês futuro mostra o estado vazio", () => {
    desenhar({ mesFuturo: true, acumulado: [] });

    expect(screen.getByText("Este mês ainda não começou")).toBeTruthy();
    expect(document.querySelector("svg[role='img']")).toBeNull();
  });

  it("mês sem gastos e sem renda mostra o estado vazio", () => {
    desenhar({ acumulado: ["0.00", "0.00"], ideal: undefined });

    expect(screen.getByText("Nenhum gasto neste mês")).toBeTruthy();
    expect(document.querySelector("svg[role='img']")).toBeNull();
  });

  it("mês sem gastos mas com renda continua com o gráfico", () => {
    desenhar({ acumulado: ["0.00", "0.00"] });

    expect(grafico()).toBeTruthy();
  });

  it("desconecta o ResizeObserver ao sair e usa a largura medida", () => {
    const desconectar = vi.fn();
    class Observador {
      aoMedir: () => void;
      constructor(aoMedir: () => void) {
        this.aoMedir = aoMedir;
      }
      observe() {
        this.aoMedir();
      }
      disconnect = desconectar;
    }
    vi.stubGlobal("ResizeObserver", Observador);
    const medida = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 320 } as DOMRect);
    try {
      const { unmount } = desenhar();
      expect(grafico().getAttribute("width")).toBe("320");
      unmount();
      expect(desconectar).toHaveBeenCalled();
    } finally {
      medida.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("na troca de mês a curva interpola e o quadro pendente é cancelado ao sair", () => {
    const cancelar = vi.spyOn(globalThis, "cancelAnimationFrame");
    const pedir = vi.spyOn(globalThis, "requestAnimationFrame").mockReturnValue(7);
    try {
      const props = { ideal: IDEAL, mesFuturo: false };
      const { rerender, unmount } = render(
        <GraficoDeRitmo periodo={OUTUBRO} acumulado={ACUMULADO} {...props} />,
      );
      rerender(
        <GraficoDeRitmo
          periodo={{ ano: 2026, mes: 11 }}
          acumulado={["100.00", "200.00"]}
          ideal={ritmoIdealPorDia("310.00", { ano: 2026, mes: 11 })}
          mesFuturo={false}
        />,
      );
      expect(pedir).toHaveBeenCalled();
      unmount();
      expect(cancelar).toHaveBeenCalledWith(7);
    } finally {
      pedir.mockRestore();
      cancelar.mockRestore();
    }
  });

  it("sem movimento reduzido não há quadro de animação na troca de mês", () => {
    definirMidia(true);
    const pedir = vi.spyOn(globalThis, "requestAnimationFrame");
    try {
      const { rerender } = render(
        <GraficoDeRitmo periodo={OUTUBRO} acumulado={ACUMULADO} ideal={IDEAL} mesFuturo={false} />,
      );
      rerender(
        <GraficoDeRitmo periodo={{ ano: 2026, mes: 11 }} acumulado={["1.00"]} ideal={undefined} mesFuturo={false} />,
      );
      expect(pedir).not.toHaveBeenCalled();
    } finally {
      pedir.mockRestore();
      definirMidia(false);
    }
  });

  it("sem ResizeObserver, o SVG mede 560 px", () => {
    desenhar();

    expect(grafico().getAttribute("width")).toBe("560");
  });
});
