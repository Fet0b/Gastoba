import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BarraDeAbas } from "./BarraDeAbas";
import type { Navegacao, Tela } from "./telas";

function criar(tela: Tela = "inicio"): Navegacao {
  return { nomeDaPessoa: "Ana", tela, aoIrPara: vi.fn(), aoSair: vi.fn() };
}

describe("BarraDeAbas", () => {
  it("mostra as quatro principais e o botão Mais", () => {
    render(<BarraDeAbas navegacao={criar("contas")} />);
    const nav = screen.getByRole("navigation", { name: "Telas" });
    expect(
      within(nav)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Início", "Transações", "Orçamento", "Contas", "Mais"]);
    expect(screen.getByRole("button", { name: "Contas" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("button", { name: "Mais" }).getAttribute("aria-current")).toBeNull();
  });

  it("chama aoIrPara ao tocar numa aba", () => {
    const navegacao = criar();
    render(<BarraDeAbas navegacao={navegacao} />);
    fireEvent.click(screen.getByRole("button", { name: "Transações" }));
    expect(navegacao.aoIrPara).toHaveBeenCalledWith("transacoes");
  });

  it("não mostra a folha antes de abrir", () => {
    render(<BarraDeAbas navegacao={criar()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("abre a folha com as outras quatro; escolher uma navega e fecha", () => {
    const navegacao = criar();
    render(<BarraDeAbas navegacao={navegacao} />);
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    const folha = screen.getByRole("dialog");
    expect(
      within(folha)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Faturas", "Tags", "Outros", "Perfil"]);
    fireEvent.click(within(folha).getByRole("button", { name: "Tags" }));
    expect(navegacao.aoIrPara).toHaveBeenCalledWith("tags");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("marca Mais e a entrada da folha quando a tela atual está em Mais", () => {
    render(<BarraDeAbas navegacao={criar("perfil")} />);
    const mais = screen.getByRole("button", { name: "Mais" });
    expect(mais.getAttribute("aria-current")).toBe("page");
    fireEvent.click(mais);
    const folha = screen.getByRole("dialog");
    expect(within(folha).getByRole("button", { name: "Perfil" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(within(folha).getByRole("button", { name: "Tags" }).getAttribute("aria-current")).toBeNull();
  });

  it("fecha com Esc e devolve o foco ao botão Mais", () => {
    render(<BarraDeAbas navegacao={criar()} />);
    const mais = screen.getByRole("button", { name: "Mais" });
    fireEvent.click(mais);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(mais);
  });

  it("fecha com o botão Fechar e devolve o foco", () => {
    render(<BarraDeAbas navegacao={criar()} />);
    const mais = screen.getByRole("button", { name: "Mais" });
    fireEvent.click(mais);
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(mais);
  });
});
