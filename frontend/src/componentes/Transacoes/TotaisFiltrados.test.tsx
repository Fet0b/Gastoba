import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { TransacaoDaLinha } from "../../transacoes/linhaDoTempo";
import { definirMidia } from "../../testes/preparar";
import { TotaisFiltrados } from "./TotaisFiltrados";

const NBSP = "\u{a0}";

function gasto(valor: string): TransacaoDaLinha {
  return {
    tipo: "gasto", id: `g${valor}${Math.random()}`, conta_id: "c1", valor, descricao: "Gasto",
    data: "2026-10-10", categoria: "conforto", tags: [], origem: "manual", recorrencia_id: null,
  };
}

function ganho(valor: string): TransacaoDaLinha {
  return {
    tipo: "ganho", id: `n${valor}${Math.random()}`, conta_id: "c1", valor, descricao: "Ganho",
    data: "2026-10-10", tags: [], origem: "manual", recorrencia_id: null,
  };
}

function termo(container: HTMLElement, rotulo: string): string {
  const alvo = [...container.querySelectorAll("dt")].find((dt) => dt.textContent === rotulo);
  return alvo?.nextElementSibling?.textContent ?? "";
}

describe("TotaisFiltrados", () => {
  it("mostra entradas, saídas e o saldo exatos (0,10 + 0,20)", () => {
    definirMidia(true);
    const { container } = render(
      <TotaisFiltrados transacoes={[gasto("0.10"), gasto("0.20"), ganho("1.00")]} />,
    );

    expect(termo(container, "Entradas")).toContain(`R$${NBSP}1,00`);
    expect(termo(container, "Saídas")).toContain(`R$${NBSP}0,30`);
    expect(termo(container, "Saldo")).toContain(`R$${NBSP}0,70`);
  });

  it("saldo negativo leva o sinal de menos", () => {
    definirMidia(true);
    const { container } = render(<TotaisFiltrados transacoes={[gasto("25.90")]} />);

    expect(termo(container, "Saldo")).toContain(`\u{2212}R$${NBSP}25,90`);
  });

  it("sem transações, tudo zerado", () => {
    definirMidia(true);
    const { container } = render(<TotaisFiltrados transacoes={[]} />);

    expect(termo(container, "Saldo")).toContain(`R$${NBSP}0,00`);
  });
});
