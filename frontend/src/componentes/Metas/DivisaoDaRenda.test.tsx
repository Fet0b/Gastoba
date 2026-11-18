import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AlvoDaMeta, Meta } from "../../api/tipos";
import { DivisaoDaRenda } from "./DivisaoDaRenda";

const NBSP = "\u{a0}";
const PONTO_MEDIO = "·";

const CATEGORIAS: AlvoDaMeta[] = [
  { codigo: "lazer", nome: "Lazer" },
  { codigo: "gasto_fixo", nome: "Gasto fixo" },
];

function meta(categoria: string, percentual: number): Meta {
  return { categoria, nome: categoria, percentual } as Meta;
}

function renderizar(metas: Meta[], renda = "5000.00") {
  return render(<DivisaoDaRenda categorias={CATEGORIAS} metas={metas} renda={renda} />);
}

describe("DivisaoDaRenda", () => {
  it("soma 100: nenhum 'Sem destino'", () => {
    renderizar([meta("lazer", 40), meta("gasto_fixo", 60)]);

    const legenda = screen.getByRole("list", { name: "Legenda da divisão da renda" });
    expect(legenda.textContent).not.toContain("Sem destino");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("soma 70: mostra 'Sem destino 30%'", () => {
    renderizar([meta("lazer", 40), meta("gasto_fixo", 30)]);

    const legenda = screen.getByRole("list", { name: "Legenda da divisão da renda" });
    expect(legenda.textContent).toContain("Sem destino 30%");
  });

  it("a legenda traz só 'Nome N%', sem reais e sem separador", () => {
    renderizar([meta("lazer", 25)]);

    const legenda = screen.getByRole("list", { name: "Legenda da divisão da renda" });
    expect(legenda.textContent).toContain("Lazer 25%");
    expect(legenda.textContent).not.toContain("R$");
    expect(legenda.textContent).not.toContain(PONTO_MEDIO);
    const itens = Array.from(legenda.querySelectorAll("li"));
    expect(itens[0].querySelectorAll("span:not([aria-hidden])")).toHaveLength(2);
  });

  it("o rótulo acessível da faixa continua com nome, percentual e valor em reais", () => {
    renderizar([meta("lazer", 25)]);

    const faixa = screen.getByRole("img");
    const rotulo = faixa.getAttribute("aria-label") ?? "";
    expect(rotulo).toContain(`Lazer 25% (R$${NBSP}1.250,00)`);
    expect(rotulo).toContain(`sem destino 75% (R$${NBSP}3.750,00)`);
  });

  it("cada segmento leva o valor para o balão do hover (decorativo)", () => {
    const { container } = renderizar([meta("lazer", 25)]);

    const segmento = container.querySelector("[data-valor]") as HTMLElement;
    expect(segmento.getAttribute("data-rotulo")).toBe(`Lazer 25%, R$${NBSP}1.250,00`);
    expect(segmento.getAttribute("aria-hidden")).toBe("true");
  });
});
