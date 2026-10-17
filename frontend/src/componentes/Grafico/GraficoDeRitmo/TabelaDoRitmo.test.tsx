import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TabelaDoRitmo } from "./TabelaDoRitmo";

const NBSP = "\u{a0}";

describe("TabelaDoRitmo", () => {
  it("tem uma linha por dia, com o gasto do dia, o acumulado e o ritmo ideal", () => {
    const { container } = render(
      <TabelaDoRitmo
        acumulado={["0.10", "0.30", "0.30"]}
        ideal={["10.00", "20.00", "30.00", "40.00"]}
      />,
    );

    const linhas = container.querySelectorAll("tbody tr");
    expect(linhas).toHaveLength(3);
    const celulas = (i: number) => Array.from(linhas[i].children).map((c) => c.textContent);
    expect(celulas(0)).toEqual(["1", `R$${NBSP}0,10`, `R$${NBSP}0,10`, `R$${NBSP}10,00`]);
    expect(celulas(1)).toEqual(["2", `R$${NBSP}0,20`, `R$${NBSP}0,30`, `R$${NBSP}20,00`]);
    expect(celulas(2)).toEqual(["3", `R$${NBSP}0,00`, `R$${NBSP}0,30`, `R$${NBSP}30,00`]);
  });

  it("sem ritmo ideal, a coluna não existe", () => {
    const { container } = render(<TabelaDoRitmo acumulado={["1.00"]} ideal={undefined} />);

    expect(container.querySelectorAll("thead th")).toHaveLength(3);
    expect(container.querySelector("tbody tr")?.children).toHaveLength(3);
  });
});
