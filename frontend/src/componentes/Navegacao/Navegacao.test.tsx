import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { definirLayoutEstreito, definirLayoutIntermediario } from "../../testes/preparar";
import { Navegacao } from "./Navegacao";
import type { Navegacao as DadosDaNavegacao } from "./telas";

const dados: DadosDaNavegacao = {
  nomeDaPessoa: "Ana",
  tela: "inicio",
  aoIrPara: vi.fn(),
  aoSair: vi.fn(),
};

describe("Navegacao", () => {
  it("usa a barra lateral no computador", () => {
    render(<Navegacao navegacao={dados} estadoDoOlho="normal" />);
    expect(screen.getAllByRole("navigation", { name: "Telas" })).toHaveLength(1);
    expect(screen.getAllByRole("link")).toHaveLength(10);
    expect(screen.queryByRole("button", { name: "Mais" })).toBeNull();
  });

  it("usa a barra de abas no celular", () => {
    definirLayoutEstreito(true);
    render(<Navegacao navegacao={dados} estadoDoOlho="normal" />);
    expect(screen.getAllByRole("navigation", { name: "Telas" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Mais" })).toBeTruthy();
  });

  it("troca de barra quando a largura muda", () => {
    render(<Navegacao navegacao={dados} estadoDoOlho="normal" />);
    act(() => definirLayoutEstreito(true));
    expect(screen.getByRole("button", { name: "Mais" })).toBeTruthy();
    act(() => definirLayoutEstreito(false));
    expect(screen.queryByRole("button", { name: "Mais" })).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(10);
  });

  it("de 45rem a 64rem usa a barra lateral recolhida: só ícones, com o nome acessível em cada item", () => {
    definirLayoutIntermediario(true);
    const { container } = render(<Navegacao navegacao={dados} estadoDoOlho="normal" />);
    expect(screen.queryByRole("button", { name: "Mais" })).toBeNull();
    expect(container.querySelector("aside")?.getAttribute("data-recolhida")).toBe("");
    for (const nome of ["Início", "Transações", "Orçamento", "Contas", "Investimentos", "Caixinhas", "Faturas", "Tags", "Recorrências", "Perfil"]) {
      expect(screen.getByRole("link", { name: nome }).getAttribute("data-rotulo")).toBe(nome);
    }
    expect(screen.getByRole("heading", { level: 1, name: "Gastoba" })).toBeTruthy();
  });

  it("a barra lateral completa não é recolhida", () => {
    const { container } = render(<Navegacao navegacao={dados} estadoDoOlho="normal" />);
    expect(container.querySelector("aside")?.hasAttribute("data-recolhida")).toBe(false);
  });
});
