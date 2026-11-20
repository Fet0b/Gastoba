import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Categoria, Conta } from "../../api/tipos";
import { FILTROS_VAZIOS } from "../../transacoes/filtros";
import { FiltrosEmFolha } from "./FiltrosEmFolha";

const CONTAS = [
  { id: "c1", nome: "Corrente", rotulo: "Corrente", tipo: "corrente", final_do_numero: null },
  { id: "c2", nome: "Cartão Roxo", rotulo: "Cartão Roxo", tipo: "cartao", final_do_numero: "7788" },
] as Conta[];
const CATEGORIAS: Categoria[] = [
  { codigo: "lazer", nome: "Lazer", legada: false },
  { codigo: "conforto", nome: "Conforto", legada: false },
];

function renderizar(extra: Partial<Parameters<typeof FiltrosEmFolha>[0]> = {}) {
  const props = {
    contas: CONTAS,
    categorias: CATEGORIAS,
    tags: ["mercado", "pix"],
    filtros: FILTROS_VAZIOS,
    aoAlternar: vi.fn(),
    aoLimparTudo: vi.fn(),
    ...extra,
  };
  return { props, ...render(<FiltrosEmFolha {...props} />) };
}

describe("FiltrosEmFolha", () => {
  it("sem filtros mostra só o botão 'Filtros', sem chips e sem a folha", () => {
    renderizar();

    expect(screen.getByRole("button", { name: "Filtros" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("group", { name: "Filtrar por conta" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Filtros ativos" })).toBeNull();
  });

  it("com filtros conta quantos há e mostra cada um como chip removível", () => {
    const { props } = renderizar({ filtros: { contas: ["c2"], categorias: ["lazer"], tags: ["pix"] } });

    expect(screen.getByRole("button", { name: "Filtros (3)" })).toBeTruthy();
    const ativos = screen.getByRole("list", { name: "Filtros ativos" });
    expect(within(ativos).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Remover filtro: Cartão Roxo, final 7788, Cartão de crédito",
      "Remover filtro: Lazer",
      "Remover filtro: pix",
    ]);

    fireEvent.click(within(ativos).getByRole("button", { name: "Remover filtro: Cartão Roxo, final 7788, Cartão de crédito" }));
    expect(props.aoAlternar).toHaveBeenCalledWith("contas", "c2");
    fireEvent.click(within(ativos).getByRole("button", { name: "Remover filtro: Lazer" }));
    expect(props.aoAlternar).toHaveBeenCalledWith("categorias", "lazer");
    fireEvent.click(within(ativos).getByRole("button", { name: "Remover filtro: pix" }));
    expect(props.aoAlternar).toHaveBeenCalledWith("tags", "pix");
  });

  it("o botão abre a folha com os três grupos de chips; 'Concluir' fecha e devolve o foco ao botão", () => {
    const { props } = renderizar();
    const botao = screen.getByRole("button", { name: "Filtros" });
    fireEvent.click(botao);

    const folha = screen.getByRole("dialog", { name: "Filtros" });
    expect(within(folha).getByRole("group", { name: "Filtrar por conta" })).toBeTruthy();
    expect(within(folha).getByRole("group", { name: "Filtrar por categoria" })).toBeTruthy();
    expect(within(folha).getByRole("group", { name: "Filtrar por tag" })).toBeTruthy();

    fireEvent.click(within(folha).getByRole("button", { name: "Conforto" }));
    expect(props.aoAlternar).toHaveBeenCalledWith("categorias", "conforto");

    fireEvent.click(within(folha).getByRole("button", { name: "Concluir" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(botao);
  });

  it("omite a categoria legada e usa chips, com a escolhida pressionada e o ícone de selecionada", () => {
    renderizar({
      categorias: [{ codigo: "investimentos", nome: "Investimentos (antiga)", legada: true }, ...CATEGORIAS],
      filtros: { contas: [], categorias: ["lazer"], tags: [] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Filtros (1)" }));
    const folha = screen.getByRole("dialog", { name: "Filtros" });

    expect(within(folha).queryByRole("button", { name: "Investimentos (antiga)" })).toBeNull();
    const lazer = within(folha).getByRole("button", { name: "Lazer" });
    expect(lazer.hasAttribute("data-chip")).toBe(true);
    expect(lazer.getAttribute("aria-pressed")).toBe("true");
    expect(lazer.querySelector("svg")).not.toBeNull();
    expect(within(folha).getByRole("button", { name: "Conforto" }).querySelector("[data-ponto]")).not.toBeNull();
  });

  it("vários valores no mesmo grupo contam cada um", () => {
    renderizar({ filtros: { contas: ["c1", "c2"], categorias: [], tags: [] } });

    expect(screen.getByRole("button", { name: "Filtros (2)" })).toBeTruthy();
  });

  it("Esc fecha a folha; 'Limpar filtros' só aparece com filtro ativo", () => {
    const { props } = renderizar({ filtros: { contas: [], categorias: [], tags: ["pix"] } });
    fireEvent.click(screen.getByRole("button", { name: "Filtros (1)" }));
    const folha = screen.getByRole("dialog", { name: "Filtros" });

    fireEvent.click(within(folha).getByRole("button", { name: "Limpar filtros" }));
    expect(props.aoLimparTudo).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(folha, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
