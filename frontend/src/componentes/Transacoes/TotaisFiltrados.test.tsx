import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { TransacaoDaLinha } from "../../transacoes/linhaDoTempo";
import { definirMidia } from "../../testes/preparar";
import { TotaisFiltrados } from "./TotaisFiltrados";

const NBSP = "\u{a0}";

function gasto(valor: string): TransacaoDaLinha {
  return {
    tipo: "gasto", id: `g${valor}${Math.random()}`, conta_id: "c1", valor, descricao: "Gasto",
    data: "2026-10-10", categoria: "conforto", valor_coberto:"0.00",coberturas:[], tags: [], origem: "manual", recorrencia_id: null,
  };
}

function ganho(valor: string): TransacaoDaLinha {
  return {
    tipo: "ganho", id: `n${valor}${Math.random()}`, conta_id: "c1", valor, descricao: "Ganho",
    data: "2026-10-10", tags: [], origem: "manual", recorrencia_id: null,
  };
}

function indicador(container: HTMLElement, rotulo: string): Element | null {
  return [...container.querySelectorAll('[role="group"]')].find((g) => g.getAttribute("aria-label") === rotulo) ?? null;
}

function termo(container: HTMLElement, rotulo: string): string {
  return indicador(container, rotulo)?.textContent ?? "";
}

function tom(container: HTMLElement, rotulo: string): string | null {
  return indicador(container, rotulo)?.getAttribute("data-tom") ?? null;
}

describe("TotaisFiltrados", () => {
  it("mostra entradas, saídas e o saldo exatos (0,10 + 0,20)", () => {
    definirMidia(true);
    const { container } = render(
      <TotaisFiltrados transacoes={[gasto("0.10"), gasto("0.20"), ganho("1.00")]} />,
    );

    expect(termo(container, "Entradas")).toContain(`R$${NBSP}1,00`);
    expect(termo(container, "Saídas")).toContain(`R$${NBSP}0,30`);
    expect(termo(container, "Saldo do mês")).toContain(`R$${NBSP}0,70`);
  });

  it("saldo negativo leva o sinal de menos", () => {
    definirMidia(true);
    const { container } = render(<TotaisFiltrados transacoes={[gasto("25.90")]} />);

    expect(termo(container, "Saldo do mês")).toContain(`\u{2212}R$${NBSP}25,90`);
  });

  it("sem transações, tudo zerado", () => {
    definirMidia(true);
    const { container } = render(<TotaisFiltrados transacoes={[]} />);

    expect(termo(container, "Saldo do mês")).toContain(`R$${NBSP}0,00`);
  });

  it("os tons seguem o sinal: entradas positivo, saídas negativo e o saldo pelo sinal", () => {
    definirMidia(true);
    const positivo = render(<TotaisFiltrados transacoes={[ganho("5.00")]} />).container;
    expect(tom(positivo, "Entradas")).toBe("positivo");
    expect(tom(positivo, "Saídas")).toBe("negativo");
    expect(tom(positivo, "Saldo do mês")).toBe("positivo");
    const negativo = render(<TotaisFiltrados transacoes={[gasto("5.00")]} />).container;
    expect(tom(negativo, "Saldo do mês")).toBe("negativo");
    const zerado = render(<TotaisFiltrados transacoes={[]} />).container;
    expect(tom(zerado, "Saldo do mês")).toBe("neutro");
  });

  it("com busca ou filtro o saldo diz que é o da lista", () => {
    definirMidia(true);
    const { container } = render(<TotaisFiltrados transacoes={[gasto("5.00")]} filtrada />);

    expect(termo(container, "Saldo da lista")).toContain(`R$${NBSP}5,00`);
    expect(indicador(container, "Saldo do mês")).toBeNull();
  });
});
