import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BarraLateral } from "./BarraLateral";
import type { Navegacao, Tela } from "./telas";

function criar(tela: Tela = "inicio"): Navegacao {
  return { nomeDaPessoa: "Ana", tela, aoIrPara: vi.fn(), aoSair: vi.fn() };
}

describe("BarraLateral", () => {
  it("mostra a marca como título e o nome da pessoa", () => {
    render(<BarraLateral navegacao={criar()} estadoDoOlho="normal" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Gastoba");
    expect(document.body.textContent).toContain("Conectado como");
    expect(document.body.textContent).toContain("Ana");
  });

  it("tem uma navegação Telas com oito botões e marca a atual", () => {
    render(<BarraLateral navegacao={criar("tags")} estadoDoOlho="normal" />);
    const nav = screen.getByRole("navigation", { name: "Telas" });
    const botoes = within(nav).getAllByRole("button");
    expect(botoes).toHaveLength(8);
    expect(botoes.map((b) => b.textContent)).toContain("Transações");
    const atuais = botoes.filter((b) => b.getAttribute("aria-current") === "page");
    expect(atuais.map((b) => b.textContent)).toEqual(["Tags"]);
  });

  it("chama aoIrPara ao clicar numa tela", () => {
    const navegacao = criar();
    render(<BarraLateral navegacao={navegacao} estadoDoOlho="normal" />);
    fireEvent.click(screen.getByRole("button", { name: "Orçamento" }));
    expect(navegacao.aoIrPara).toHaveBeenCalledWith("orcamento");
  });

  it("mostra as oito telas na ordem, com ou sem importação bancária", () => {
    const esperado = ["Início", "Transações", "Orçamento", "Contas", "Faturas", "Tags", "Outros", "Perfil"];
    const { unmount } = render(<BarraLateral navegacao={criar()} estadoDoOlho="normal" />);
    const nomes = () =>
      within(screen.getByRole("navigation", { name: "Telas" }))
        .getAllByRole("button")
        .map((botao) => botao.textContent);
    expect(nomes()).toEqual(esperado);
    unmount();

    render(
      <BarraLateral navegacao={{ ...criar(), importacaoBancaria: true }} estadoDoOlho="normal" />,
    );
    expect(nomes()).toEqual(esperado);
  });

  it("marca só a tela atual e leva ao Perfil", () => {
    const navegacao = criar("orcamento");
    render(<BarraLateral navegacao={navegacao} estadoDoOlho="normal" />);
    expect(screen.getByRole("button", { name: "Início" }).getAttribute("aria-current")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Perfil" }));
    expect(navegacao.aoIrPara).toHaveBeenCalledWith("perfil");
  });

  it("não tem Sair nem links: a navegação é por botões (sem roteador)", () => {
    render(<BarraLateral navegacao={criar()} estadoDoOlho="normal" />);
    expect(screen.queryByRole("button", { name: "Sair" })).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("o olho é decorativo e reflete o estado recebido", () => {
    const { container, rerender } = render(<BarraLateral navegacao={criar()} estadoDoOlho="normal" />);
    const olho = container.querySelector("svg[data-estado]");
    expect(olho?.getAttribute("aria-hidden")).toBe("true");
    expect(olho?.getAttribute("data-estado")).toBe("normal");
    rerender(<BarraLateral navegacao={criar()} estadoDoOlho="erro" />);
    expect(container.querySelector("svg[data-estado]")?.getAttribute("data-estado")).toBe("erro");
  });
});
