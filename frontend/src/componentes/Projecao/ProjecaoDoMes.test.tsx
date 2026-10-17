import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjecaoDoMes } from "./ProjecaoDoMes";

const NBSP = "\u{a0}";
const OUTUBRO = { ano: 2026, mes: 10 };

function desenhar(
  extras: Partial<Parameters<typeof ProjecaoDoMes>[0]> & { hoje: string },
): HTMLElement {
  const { container } = render(
    <ProjecaoDoMes
      periodo={OUTUBRO}
      gastos={[{ valor: "300.00", data: "2026-10-05" }]}
      renda="1000.00"
      {...extras}
    />,
  );
  return container.firstElementChild as HTMLElement;
}

describe("ProjecaoDoMes", () => {
  it("estimativa que cabe na renda: sobra, com o ícone ok e o texto", () => {
    // dia 15 de 31: 300 * 31 / 15 = 620,00
    const bloco = desenhar({ hoje: "2026-10-15" });

    expect(bloco.textContent).toContain(`R$${NBSP}620,00`);
    expect(bloco.textContent).toContain(`Cabe na renda · sobram R$${NBSP}380,00`);
    expect(bloco.getAttribute("data-situacao")).toBe("cabe");
    expect(bloco.querySelectorAll("svg")).toHaveLength(1);
    expect(bloco.textContent).toContain("Estimativa simples, pelo ritmo dos gastos até hoje");
  });

  it("estimativa acima da renda: passa, com o ícone alerta e o texto", () => {
    const bloco = desenhar({ hoje: "2026-10-15", renda: "500.00" });

    expect(bloco.textContent).toContain(`Passa da renda em R$${NBSP}120,00`);
    expect(bloco.getAttribute("data-situacao")).toBe("passa");
    expect(bloco.querySelectorAll("svg")).toHaveLength(1);
  });

  it("sem renda: mostra a estimativa sem comparar e sem ícone", () => {
    const bloco = desenhar({ hoje: "2026-10-15", renda: "0.00" });

    expect(bloco.textContent).toContain(`R$${NBSP}620,00`);
    expect(bloco.textContent).toContain("Sem renda registrada neste mês");
    expect(bloco.textContent).not.toContain("Cabe na renda");
    expect(bloco.textContent).not.toContain("Passa da renda");
    expect(bloco.querySelector("svg")).toBeNull();
    expect(bloco.getAttribute("data-situacao")).toBe("sem_renda");
  });

  it("poucos dias: explica a regra e mostra o gasto até agora", () => {
    const bloco = desenhar({ hoje: "2026-10-02", gastos: [{ valor: "300.00", data: "2026-10-01" }] });

    expect(bloco.textContent).toContain(
      `Poucos dias de dados: a projeção aparece a partir do dia 3. Até agora: R$${NBSP}300,00`,
    );
    expect(bloco.getAttribute("data-situacao")).toBe("poucos_dias");
    expect(bloco.textContent).toContain("Estimativa simples");
  });

  it("zero gastos a partir do dia 3", () => {
    const bloco = desenhar({ hoje: "2026-10-10", gastos: [] });

    expect(bloco.textContent).toContain("Nenhum gasto até agora");
    expect(bloco.textContent).toContain(`R$${NBSP}0,00`);
  });

  it("mês passado: fechou em", () => {
    const bloco = desenhar({ hoje: "2026-11-02" });

    expect(bloco.textContent).toContain(`Fechou em R$${NBSP}300,00`);
    expect(bloco.getAttribute("data-situacao")).toBe("fechou");
    expect(bloco.textContent).toContain("Estimativa simples");
  });

  it("mês futuro: ainda não começou", () => {
    const bloco = desenhar({ hoje: "2026-09-20" });

    expect(bloco.textContent).toContain("O mês ainda não começou");
    expect(bloco.getAttribute("data-situacao")).toBe("futuro");
  });

  it("carregando: Calculando, sem estimativa de zero", () => {
    const bloco = desenhar({ hoje: "2026-10-15", gastos: undefined, carregando: true });

    expect(bloco.textContent).toContain("Calculando…");
    expect(bloco.textContent).not.toContain(`R$${NBSP}0,00`);
    expect(bloco.getAttribute("data-situacao")).toBe("carregando");
  });

  it("erro: não foi possível calcular", () => {
    const bloco = desenhar({ hoje: "2026-10-15", gastos: undefined, erro: true });

    expect(bloco.textContent).toContain("Não foi possível calcular");
    expect(bloco.getAttribute("data-situacao")).toBe("erro");
  });
});
