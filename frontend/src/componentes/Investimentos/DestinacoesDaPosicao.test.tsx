import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Investimento } from "../../api/tipos";
import { definirLayoutEstreito } from "../../testes/preparar";
import { DestinacoesDaPosicao } from "./DestinacoesDaPosicao";

const NBSP = "\u{a0}";

const investimento: Investimento = {
  id: "i1",
  nome: "CDB Banco",
  tipo: "FIXED_INCOME",
  subtipo: "CDB",
  saldo: "1000.00",
  valor_aplicado: "900.00",
  rendimento: "100.00",
  rentabilidade: "11.11",
  origem_da_rentabilidade: "instituicao",
  taxa: null,
  atualizado_em: null,
  destinacoes: [
    { cor: null, tag: "viagem", principal: "600.00", valor_atual: "666.67", rendimento: "66.67", rentabilidade: "11.11" },
    { cor: null, tag: null, principal: "0.00", valor_atual: "333.33", rendimento: "0.00", rentabilidade: null },
  ],
};

describe("DestinacoesDaPosicao", () => {
  it("no computador é uma tabela com cabeçalhos de coluna e de linha", () => {
    render(<DestinacoesDaPosicao investimento={investimento} />);

    const tabela = screen.getByRole("table", { name: "Destinações de CDB Banco" });
    expect(within(tabela).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Destinação",
      "Principal",
      "Valor atual",
      "Rendimento",
    ]);
    expect(within(tabela).getAllByRole("rowheader")).toHaveLength(2);
    expect(within(tabela).queryByRole("button", { name: /Orçamento de/ })).toBeNull();
  });

  it("no celular vira uma lista: o nome em cima e Principal, Valor atual e Rendimento em pares", () => {
    definirLayoutEstreito(true);
    render(<DestinacoesDaPosicao investimento={investimento} />);

    expect(screen.queryByRole("table")).toBeNull();
    const lista = screen.getByRole("list", { name: "Destinações de CDB Banco" });
    const itens = within(lista).getAllByRole("listitem");
    expect(itens).toHaveLength(2);
    const primeiro = itens[0];
    expect(within(primeiro).getByText("Viagem")).toBeTruthy();
    expect(within(primeiro).queryByRole("button", { name: /Orçamento de/ })).toBeNull();
    const pares = Array.from(primeiro.querySelectorAll("dt")).map((dt) => [
      dt.textContent,
      dt.nextElementSibling?.textContent,
    ]);
    expect(pares).toEqual([
      ["Principal", `R$${NBSP}600,00`],
      ["Valor atual", `R$${NBSP}666,67`],
      ["Rendimento", expect.stringContaining(`+R$${NBSP}66,67`)],
    ]);
    expect(within(itens[1]).getByText("Sem destinação")).toBeTruthy();
  });

  it("a barra de 'Sem destinação' é neutra: não leva cor inline de caixinha", () => {
    render(<DestinacoesDaPosicao investimento={investimento} />);

    const neutras = Array.from(document.querySelectorAll<HTMLElement>("[data-neutra]"));
    expect(neutras).toHaveLength(1);
    expect(neutras[0].style.backgroundColor).toBe("");
    expect(neutras[0].style.width).toBe("33%");
  });

  it("o rendimento da destinação é positivo, negativo ou neutro pelo sinal (tabela e lista)", () => {
    const base = investimento.destinacoes[0];
    const variado: Investimento = {
      ...investimento,
      destinacoes: [
        { ...base, tag: "a", rendimento: "10.00" },
        { ...base, tag: "b", rendimento: "-5.00" },
        { ...base, tag: "c", rendimento: "0.00" },
      ],
    };
    const tons = () => Array.from(document.querySelectorAll("[data-tom]")).map((e) => e.getAttribute("data-tom"));

    const { unmount } = render(<DestinacoesDaPosicao investimento={variado} />);
    expect(tons()).toEqual(["positivo", "negativo", "neutro"]);
    unmount();

    definirLayoutEstreito(true);
    render(<DestinacoesDaPosicao investimento={variado} />);
    expect(tons()).toEqual(["positivo", "negativo", "neutro"]);
  });

  it("a parte sem destinação mostra principal e rendimento quando há principal, e traço quando não há", () => {
    const com: Investimento = {
      ...investimento,
      destinacoes: [
        investimento.destinacoes[0],
        { cor: null, tag: null, principal: "300.00", valor_atual: "333.33", rendimento: "33.33", rentabilidade: "11.11" },
      ],
    };
    const { unmount } = render(<DestinacoesDaPosicao investimento={com} />);
    const linhaCom = screen.getAllByRole("row")[2];
    expect(linhaCom.textContent).toContain(`R$${NBSP}300,00`);
    expect(linhaCom.textContent).toContain(`+R$${NBSP}33,33`);
    expect(linhaCom.querySelector("[data-tom]")?.getAttribute("data-tom")).toBe("positivo");
    unmount();

    render(<DestinacoesDaPosicao investimento={investimento} />);
    const linhaSem = screen.getAllByRole("row")[2];
    expect(linhaSem.textContent).toContain("—");
    expect(linhaSem.querySelector("[data-tom]")?.getAttribute("data-tom")).toBe("neutro");
  });
});
