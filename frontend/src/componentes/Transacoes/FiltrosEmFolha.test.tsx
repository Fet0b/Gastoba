import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Categoria, Conta } from "../../api/tipos";
import { FiltrosEmFolha } from "./FiltrosEmFolha";

const CONTAS = [
  { id: "c1", nome: "Corrente" },
  { id: "c2", nome: "Cartão Roxo" },
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
    contaSelecionada: null,
    categoria: null,
    tag: null,
    aoMudarConta: vi.fn(),
    aoAlternarCategoria: vi.fn(),
    aoLimparCategoria: vi.fn(),
    aoAlternarTag: vi.fn(),
    aoLimparTag: vi.fn(),
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
    const { props } = renderizar({ contaSelecionada: "c2", categoria: "lazer", tag: "pix" });

    expect(screen.getByRole("button", { name: "Filtros (3)" })).toBeTruthy();
    const ativos = screen.getByRole("list", { name: "Filtros ativos" });
    expect(within(ativos).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Remover filtro: Cartão Roxo",
      "Remover filtro: Lazer",
      "Remover filtro: pix",
    ]);

    fireEvent.click(within(ativos).getByRole("button", { name: "Remover filtro: Cartão Roxo" }));
    expect(props.aoMudarConta).toHaveBeenCalledWith(null);
    fireEvent.click(within(ativos).getByRole("button", { name: "Remover filtro: Lazer" }));
    expect(props.aoLimparCategoria).toHaveBeenCalled();
    fireEvent.click(within(ativos).getByRole("button", { name: "Remover filtro: pix" }));
    expect(props.aoLimparTag).toHaveBeenCalled();
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
    expect(props.aoAlternarCategoria).toHaveBeenCalledWith("conforto");

    fireEvent.click(within(folha).getByRole("button", { name: "Concluir" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(botao);
  });

  it("Esc fecha a folha; 'Limpar filtros' só aparece com filtro ativo", () => {
    const { props } = renderizar({ tag: "pix" });
    fireEvent.click(screen.getByRole("button", { name: "Filtros (1)" }));
    const folha = screen.getByRole("dialog", { name: "Filtros" });

    fireEvent.click(within(folha).getByRole("button", { name: "Limpar filtros" }));
    expect(props.aoLimparTudo).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(folha, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
