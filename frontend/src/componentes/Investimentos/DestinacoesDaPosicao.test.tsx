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
});
