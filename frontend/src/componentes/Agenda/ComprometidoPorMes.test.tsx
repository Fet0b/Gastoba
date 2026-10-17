import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Recorrencia } from "../../api/tipos";
import { ComprometidoPorMes } from "./ComprometidoPorMes";

const NBSP = "\u{a0}";
const MENOS = "\u{2212}";
const HOJE = "2026-06-10";

function rec(extra: Partial<Recorrencia> = {}): Recorrencia {
  return {
    id: "r1",
    tipo: "gasto",
    conta_id: "c1",
    valor: "100.00",
    descricao: "Aluguel",
    dia_do_mes: 10,
    inicio: "2026-01-01",
    fim: null,
    categoria: "gasto_fixo",
    tags: [],
    ativa: true,
    ...extra,
  };
}

function mostrar(recorrencias: Recorrencia[] | undefined, carregando = false) {
  const { container } = render(
    <ComprometidoPorMes recorrencias={recorrencias} hoje={HOJE} carregando={carregando} />,
  );
  const grupo = container.querySelector('[role="group"]') as HTMLElement;
  return { container, grupo };
}

describe("ComprometidoPorMes", () => {
  it("mostra ganhos, gastos e a diferença das recorrências vigentes", () => {
    const { grupo } = mostrar([
      rec({ id: "a", tipo: "ganho", valor: "5000.00", categoria: null }),
      rec({ id: "b", valor: "1500.00" }),
      rec({ id: "c", valor: "500.00" }),
    ]);

    expect(grupo.getAttribute("aria-label")).toBe(
      `Comprometido por mês: ganhos fixos R$${NBSP}5.000,00, gastos fixos R$${NBSP}2.000,00, diferença R$${NBSP}3.000,00`,
    );
    expect(grupo.textContent).toContain(`+R$${NBSP}5.000,00`);
    expect(grupo.textContent).toContain(`${MENOS}R$${NBSP}2.000,00`);
    expect(grupo.textContent).toContain("Sobram");
    expect(grupo.getAttribute("data-tom")).toBe("positivo");
  });

  it("ignora as encerradas e as que já passaram do fim", () => {
    const { grupo } = mostrar([
      rec({ id: "a", valor: "100.00" }),
      rec({ id: "b", valor: "900.00", ativa: false }),
      rec({ id: "c", valor: "700.00", fim: "2026-05-31" }),
    ]);

    expect(grupo.textContent).toContain(`${MENOS}R$${NBSP}100,00`);
    expect(grupo.textContent).not.toContain("900,00");
    expect(grupo.textContent).not.toContain("700,00");
  });

  it("diferença negativa traz sinal, ícone e o texto sem depender da cor", () => {
    const { grupo } = mostrar([
      rec({ id: "a", tipo: "ganho", valor: "1000.00", categoria: null }),
      rec({ id: "b", valor: "1500.00" }),
    ]);

    expect(grupo.textContent).toContain("Gastos fixos passam dos ganhos fixos");
    expect(grupo.textContent).toContain(`${MENOS}R$${NBSP}500,00`);
    expect(grupo.getAttribute("data-tom")).toBe("negativo");
    expect(grupo.querySelector("svg")).not.toBeNull();
  });

  it("sem recorrências, mostra zero nos dois lados", () => {
    const { grupo } = mostrar([]);

    expect(grupo.textContent).toContain(`+R$${NBSP}0,00`);
    expect(grupo.textContent).toContain(`R$${NBSP}0,00`);
    expect(grupo.getAttribute("data-tom")).toBe("neutro");
  });

  it("não perde precisão com valores grandes", () => {
    const { grupo } = mostrar([
      rec({ id: "a", tipo: "ganho", valor: "999999999999.99", categoria: null }),
      rec({ id: "b", valor: "0.01" }),
    ]);

    expect(grupo.textContent).toContain(`R$${NBSP}999.999.999.999,98`);
  });

  it("enquanto carrega, não mostra números", () => {
    const { container } = mostrar(undefined, true);

    expect(container.querySelector('[role="group"]')).toBeNull();
    expect(container.textContent).toContain("Calculando");
  });
});
