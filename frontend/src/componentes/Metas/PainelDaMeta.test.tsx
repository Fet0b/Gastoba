import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProgressoDaMeta } from "../../api/tipos";
import type { LancamentoDaMeta } from "../../metas/lancamentosDaMeta";
import { PainelDaMeta } from "./PainelDaMeta";

const NBSP = "\u{a0}";

const progresso: ProgressoDaMeta = {
  categoria: "lazer",
  nome: "Lazer",
  percentual: 20,
  limite: "1000.00",
  gasto: "230.00",
  restante: "770.00",
  percentual_usado: 23,
  situacao: "dentro",
  gasto_bruto: "230.00",
  limite_adicional: "0.00",
  caixinhas: [],
  rentabilidade: null,
};

const lancamentos: LancamentoDaMeta[] = [
  { id: "g1", data: "2026-11-03", descricao: "Cinema", valor: "80.00", origem: "gasto", conta_id: "c1" },
  { id: "m1", data: "2026-11-02", descricao: "Aporte lazer", valor: "150.00", origem: "aporte", conta_id: "c1" },
];

function renderizar(extra: Partial<Parameters<typeof PainelDaMeta>[0]> = {}) {
  const props = {
    aberto: true,
    nome: "Lazer",
    rotuloDoMes: "novembro de 2026",
    progresso,
    lancamentos,
    nomesDasContas: new Map([["c1", "Nubank"]]),
    aoFechar: vi.fn(),
    aoVerTransacoes: vi.fn(),
    ...extra,
  };
  return { props, ...render(<PainelDaMeta {...props} />) };
}

describe("PainelDaMeta", () => {
  it("abre como diálogo modal, com o título 'Nome em mês'", () => {
    renderizar();

    const dialogo = document.querySelector("dialog") as HTMLDialogElement;
    expect(dialogo.open).toBe(true);
    expect(screen.getByRole("heading", { name: "Lazer em novembro de 2026" })).toBeTruthy();
    expect(dialogo.getAttribute("aria-labelledby")).toBe(
      screen.getByRole("heading", { name: "Lazer em novembro de 2026" }).id,
    );
  });

  it("lista os lançamentos com descrição, conta, data e valor", () => {
    renderizar();

    const itens = screen.getAllByRole("listitem");
    expect(itens).toHaveLength(2);
    expect(itens[0].textContent).toContain("Cinema");
    expect(itens[0].textContent).toContain("Nubank");
    expect(itens[0].textContent).toContain("03/11/2026");
    expect(itens[0].textContent).toContain(`R$${NBSP}80,00`);
    expect(itens[1].textContent).toContain("Aporte lazer");
    expect(itens[1].textContent).toContain(`R$${NBSP}150,00`);
  });

  it("sem lançamentos mostra o estado vazio e leva a Transações", () => {
    const { props } = renderizar({ lancamentos: [] });

    expect(screen.getByText("Nenhum lançamento nesta meta no mês")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver Transações" }));
    expect(props.aoVerTransacoes).toHaveBeenCalledTimes(1);
  });

  it("enquanto os lançamentos carregam, diz que está carregando", () => {
    renderizar({ lancamentos: undefined });

    expect(screen.getByText("Carregando os lançamentos…")).toBeTruthy();
  });

  it("Fechar e Esc chamam aoFechar", () => {
    const { props } = renderizar();

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(props.aoFechar).toHaveBeenCalledTimes(1);

    fireEvent(document.querySelector("dialog") as HTMLDialogElement, new Event("cancel", { cancelable: true }));
    expect(props.aoFechar).toHaveBeenCalledTimes(2);
  });

  it("devolve o foco ao elemento que o abriu quando fecha", () => {
    const botao = document.createElement("button");
    document.body.append(botao);
    botao.focus();
    const { rerender, props } = renderizar();

    rerender(<PainelDaMeta {...props} aberto={false} />);

    expect(document.activeElement).toBe(botao);
    botao.remove();
  });

  it("mostra o resumo do gasto contra o limite", () => {
    renderizar();

    const dialogo = document.querySelector("dialog") as HTMLElement;
    expect(
      within(dialogo).getByText((_, el) => el?.tagName === "P" && el.textContent === `R$${NBSP}230,00 de R$${NBSP}1.000,00`),
    ).toBeTruthy();
  });
});
