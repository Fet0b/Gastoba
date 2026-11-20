import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ResumoDaCaixinha } from "../../investimentos/caixinhas";
import { definirLayoutEstreito } from "../../testes/preparar";
import { PainelDaCaixinha } from "./PainelDaCaixinha";

const resumo: ResumoDaCaixinha = {
  id: "1", nome: "viagem", icone: "aviao", cor: null, valor: "1500.00", rendimento: "100.00",
  partes: [
    { investimentoId: "a", nomeDoInvestimento: "CDB Banco com um nome bem comprido 2031", valor: "1000.00", rendimento: "100.00" },
    { investimentoId: "b", nomeDoInvestimento: "LCI do banco", valor: "500.00", rendimento: "0.00" },
  ],
};

describe("PainelDaCaixinha", () => {
  it("no computador é uma tabela com a linha de total", () => {
    render(<PainelDaCaixinha resumo={resumo} id="p" aoAlocar={vi.fn()} />);

    expect(screen.getByRole("table")).toBeTruthy();
    expect(within(screen.getByRole("table")).getAllByRole("row").at(-1)?.textContent).toContain("Total");
  });

  it("em tela estreita vira blocos: nome em cima, Valor e Rendimento embaixo, e o Total no mesmo formato", () => {
    definirLayoutEstreito(true);
    render(<PainelDaCaixinha resumo={resumo} id="p" aoAlocar={vi.fn()} />);

    expect(screen.queryByRole("table")).toBeNull();
    const itens = screen.getAllByRole("listitem");
    expect(itens).toHaveLength(3);
    expect(itens[0]!.textContent).toContain("CDB Banco com um nome bem comprido 2031");
    expect(within(itens[0]!).getByText("Valor").nextElementSibling?.textContent).toBe("R$\u{00A0}1.000,00");
    expect(within(itens[0]!).getByText("Rendimento").nextElementSibling?.textContent).toBe("+R$\u{00A0}100,00");
    expect(itens[2]!.textContent).toContain("Total");
    expect(within(itens[2]!).getByText("Valor").nextElementSibling?.textContent).toBe("R$\u{00A0}1.500,00");
  });

  it("o título do painel é focável por programa (tabIndex -1) e recebe o foco ao abrir", () => {
    render(<PainelDaCaixinha resumo={resumo} id="p" aoAlocar={vi.fn()} />);
    const titulo = screen.getByRole("heading", { name: "Investimentos em Viagem" });

    expect(titulo.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(titulo);
  });

  it("rola até o painel ao abrir, sem animação com prefers-reduced-motion", () => {
    const rolar = vi.fn();
    Element.prototype.scrollIntoView = rolar;
    render(<PainelDaCaixinha resumo={resumo} id="p" aoAlocar={vi.fn()} />);

    expect(rolar).toHaveBeenCalledTimes(1);
    expect(rolar.mock.calls[0]?.[0]).toMatchObject({ block: "start" });
  });
});
