import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProgressoDaMeta } from "../../api/tipos";
import { EXPLICACAO_DA_LIBERDADE_FINANCEIRA } from "./liberdadeFinanceira";
import { LinhaDaMeta } from "./LinhaDaMeta";

const NBSP = "\u{a0}";
const PONTO_MEDIO = "·";

function progresso(extra: Partial<ProgressoDaMeta> = {}): ProgressoDaMeta {
  return {
    categoria: "lazer",
    nome: "Lazer",
    percentual: 20,
    limite: "1325.00",
    gasto: "300.00",
    restante: "1025.00",
    percentual_usado: 22,
    situacao: "dentro",
    gasto_bruto: extra.gasto ?? "300.00",
    limite_adicional: "0.00",
    caixinhas: [],
    rentabilidade: null,
    ...extra,
  };
}

function renderizar(props: Partial<Parameters<typeof LinhaDaMeta>[0]> = {}) {
  return render(
    <ul>
      <LinhaDaMeta progresso={progresso()} nome="Lazer" {...props} />
    </ul>,
  );
}

function vezes(texto: string, raiz: HTMLElement): number {
  return Array.from(raiz.querySelectorAll("*")).filter(
    (e) => e.children.length === 0 && e.textContent === texto,
  ).length;
}

describe("LinhaDaMeta", () => {
  it("mostra cada dado uma vez: nome, percentual da renda, valores e restante", () => {
    const { container } = renderizar();

    expect(vezes("Lazer", container)).toBe(1);
    expect(vezes("20% da renda", container)).toBe(1);
    expect(vezes(`R$${NBSP}300,00 de R$${NBSP}1.325,00`, container)).toBe(1);
    expect(vezes(`Restam R$${NBSP}1.025,00`, container)).toBe(1);
    expect(container.textContent).not.toContain(PONTO_MEDIO);
  });

  it("estourou mostra o excedente positivo; sem renda mostra o texto próprio", () => {
    const { container, unmount } = renderizar({
      progresso: progresso({ situacao: "estourou", gasto: "350.00", limite: "300.00", restante: "-50.00", percentual_usado: 116 }),
    });
    expect(vezes(`Estourou R$${NBSP}50,00`, container)).toBe(1);
    unmount();

    const outra = renderizar({
      progresso: progresso({ situacao: "sem_renda", limite: "0.00", restante: "-300.00", percentual_usado: null }),
    });
    expect(vezes("Sem renda", outra.container)).toBe(1);
  });

  it("o anel é uma imagem com o nome, a porcentagem usada e os valores", () => {
    renderizar();
    const anel = screen.getByRole("img", { name: `Lazer: 22% usado, R$${NBSP}300,00 de R$${NBSP}1.325,00` });
    expect(anel.querySelector("[data-centro]")?.textContent).toBe("22%");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("com aoAbrir, o nome é um botão 'Ver lançamentos de ...'; sem ele, não há botão", () => {
    const aoAbrir = vi.fn();
    const { unmount } = renderizar({ aoAbrir });
    fireEvent.click(screen.getByRole("button", { name: "Ver lançamentos de Lazer" }));
    expect(aoAbrir).toHaveBeenCalledTimes(1);
    unmount();

    renderizar();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a linha tem o nome da categoria como nome acessível", () => {
    renderizar({ aoAbrir: vi.fn() });
    expect(screen.getByRole("listitem", { name: "Lazer" })).toBeTruthy();
  });

  it("compacta não mostra 'de R$'", () => {
    const { container } = renderizar({ compacta: true });
    expect(container.textContent).not.toContain(" de R$");
    expect(container.textContent).toContain(`Restam R$${NBSP}1.025,00`);
  });

  it("renderiza as ações à direita", () => {
    renderizar({ acoes: <button type="button">Ação extra</button> });
    expect(screen.getByRole("button", { name: "Ação extra" })).toBeTruthy();
  });

  it("Liberdade financeira liga a barra à Dica com a explicação", () => {
    renderizar({
      progresso: progresso({ categoria: "liberdade_financeira", nome: "Liberdade financeira" }),
      nome: "Liberdade financeira",
      idDaExplicacao: "explicacao-lf",
    });
    const barra = screen.getByRole("img", { name: /^Liberdade financeira: / });
    expect(barra.getAttribute("aria-describedby")).toBe("explicacao-lf");
    const texto = document.getElementById("explicacao-lf") as HTMLElement;
    expect(texto.textContent).toBe(EXPLICACAO_DA_LIBERDADE_FINANCEIRA);
    expect(texto.hidden).toBe(true);
    expect(screen.getByRole("button", { name: "Sobre a Liberdade financeira" })).toBeTruthy();
  });

  it("outras categorias não têm a Dica nem o aria-describedby", () => {
    renderizar({ idDaExplicacao: "nao-usado" });
    expect(screen.getByRole("img", { name: /^Lazer: / }).getAttribute("aria-describedby")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Sobre/ })).toBeNull();
  });

  it("com caixinha pagando compras mostra o bruto contra o limite e a composição", () => {
    const { container } = renderizar({
      progresso: progresso({
        categoria: "conforto",
        nome: "Conforto",
        limite: "954.00",
        gasto: "50.00",
        restante: "904.00",
        gasto_bruto: "4200.00",
        limite_adicional: "3700.00",
        caixinhas: [
          { tag: "computador", valor: "3700.00", rentabilidade: "5.71" },
          { tag: "viagem", valor: "0.00", rentabilidade: null },
        ],
        rentabilidade: "5.71",
      }),
      nome: "Conforto",
    });

    expect(vezes(`R$${NBSP}4.200,00 de R$${NBSP}954,00`, container)).toBe(1);
    expect(vezes(`+ R$${NBSP}3.700,00 da caixinha Computador`, container)).toBe(1);
    expect(container.textContent).not.toContain("Viagem");
    expect(container.querySelector("[data-rentabilidade-da-meta]")?.textContent).toBe(
      "Rentabilidade das caixinhas +5,71%",
    );
    expect(container.textContent).not.toContain(PONTO_MEDIO);
    screen.getByRole("img", {
      name: `Conforto: 22% usado, R$${NBSP}4.200,00 de R$${NBSP}954,00 + R$${NBSP}3.700,00 da caixinha Computador`,
    });
  });

  it("sem caixinha mostra o gasto de sempre e nenhum detalhe extra", () => {
    const { container } = renderizar();
    expect(container.querySelector("[data-caixinhas-da-meta]")).toBeNull();
    expect(container.querySelector("[data-rentabilidade-da-meta]")).toBeNull();
  });

  it("no Início (compacta) não mostra a composição nem a rentabilidade", () => {
    const { container } = renderizar({
      compacta: true,
      progresso: progresso({
        limite_adicional: "10.00",
        caixinhas: [{ tag: "x", valor: "10.00", rentabilidade: "1.00" }],
        rentabilidade: "1.00",
      }),
    });
    expect(container.querySelector("[data-caixinhas-da-meta]")).toBeNull();
    expect(container.querySelector("[data-rentabilidade-da-meta]")).toBeNull();
  });
});
