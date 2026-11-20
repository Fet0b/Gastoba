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

  it("usa o nome e a logo escolhidos pela pessoa, com o h1 acompanhando", () => {
    const navegacao = { ...criar(), nomeDoApp: "Meu cofre", marca: "cofre" as const };
    const { container } = render(<BarraLateral navegacao={navegacao} estadoDoOlho="normal" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Meu cofre");
    expect(container.querySelector("[data-marca='cofre']")).not.toBeNull();
    expect(container.querySelector("svg[data-estado]")).toBeNull();
  });

  it("mostra as iniciais da pessoa no rodapé, que leva ao Perfil", () => {
    const navegacao = { ...criar(), nomeDaPessoa: "Ana Clara Souza" };
    render(<BarraLateral navegacao={navegacao} estadoDoOlho="normal" />);
    const rodape = document.querySelector("[data-rodape]");
    expect(rodape?.querySelector("[data-avatar]")?.textContent).toBe("AS");
    expect(rodape?.textContent).toContain("Perfil");
    fireEvent.click(screen.getByRole("link", { name: "Perfil" }));
    expect(navegacao.aoIrPara).toHaveBeenCalledWith("perfil");
  });

  it("o rodapé é um único botão 'Perfil' que contém o avatar e o nome", () => {
    render(<BarraLateral navegacao={{ ...criar(), nomeDaPessoa: "Ana Clara Souza" }} estadoDoOlho="normal" />);
    const botoes = screen.getAllByRole("link", { name: "Perfil" });

    expect(botoes).toHaveLength(1);
    expect(botoes[0].querySelector("[data-avatar]")).not.toBeNull();
    expect(botoes[0].textContent).toContain("Ana Clara Souza");
  });

  it("deriva uma inicial de nome único e nada de nome vazio", () => {
    const { unmount } = render(<BarraLateral navegacao={criar()} estadoDoOlho="normal" />);
    expect(document.querySelector("[data-avatar]")?.textContent).toBe("A");
    unmount();
    render(<BarraLateral navegacao={{ ...criar(), nomeDaPessoa: "  " }} estadoDoOlho="normal" />);
    expect(document.querySelector("[data-avatar]")?.textContent).toBe("?");
  });

  it("tem uma navegação Telas com dez links e marca a atual", () => {
    render(<BarraLateral navegacao={criar("tags")} estadoDoOlho="normal" />);
    const nav = screen.getByRole("navigation", { name: "Telas" });
    const botoes = within(nav).getAllByRole("link");
    expect(botoes).toHaveLength(10);
    expect(botoes.map((b) => b.textContent)).toContain("Transações");
    const atuais = botoes.filter((b) => b.getAttribute("aria-current") === "page");
    expect(atuais.map((b) => b.textContent)).toEqual(["Tags"]);
  });

  it("chama aoIrPara ao clicar numa tela", () => {
    const navegacao = criar();
    render(<BarraLateral navegacao={navegacao} estadoDoOlho="normal" />);
    fireEvent.click(screen.getByRole("link", { name: "Orçamento" }));
    expect(navegacao.aoIrPara).toHaveBeenCalledWith("orcamento");
  });

  it("mostra as dez telas na ordem, com ou sem importação bancária", () => {
    const esperado = ["Início", "Transações", "Orçamento", "Contas", "Investimentos", "Caixinhas", "Faturas", "Tags", "Recorrências", "Perfil"];
    const { unmount } = render(<BarraLateral navegacao={criar()} estadoDoOlho="normal" />);
    const nomes = () =>
      within(screen.getByRole("navigation", { name: "Telas" }))
        .getAllByRole("link")
        .map((botao) => botao.getAttribute("aria-label") ?? botao.textContent);
    expect(nomes()).toEqual(esperado);
    unmount();

    render(
      <BarraLateral navegacao={{ ...criar(), importacaoBancaria: true }} estadoDoOlho="normal" />,
    );
    expect(nomes()).toEqual(esperado);
  });

  it("Faturas não leva mais o selo 'em breve'", () => {
    render(<BarraLateral navegacao={criar()} estadoDoOlho="normal" />);
    const faturas = screen.getByRole("link", { name: "Faturas" });

    expect(faturas.textContent).not.toContain("em breve");
    expect(faturas.getAttribute("aria-describedby")).toBeNull();
  });

  it("marca só a tela atual e leva ao Perfil", () => {
    const navegacao = criar("orcamento");
    render(<BarraLateral navegacao={navegacao} estadoDoOlho="normal" />);
    expect(screen.getByRole("link", { name: "Início" }).getAttribute("aria-current")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Perfil" }));
    expect(navegacao.aoIrPara).toHaveBeenCalledWith("perfil");
  });

  it("não tem Sair nem botões: cada tela é um link com o seu endereço", () => {
    render(<BarraLateral navegacao={criar()} estadoDoOlho="normal" />);
    expect(screen.queryByRole("button", { name: "Sair" })).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/inicio", "/transacoes", "/orcamento", "/contas", "/investimentos", "/caixinhas", "/faturas", "/tags", "/recorrencias", "/perfil",
    ]);
  });

  it("clique com Ctrl não é interceptado, para abrir em outra aba", () => {
    const navegacao = criar();
    render(<BarraLateral navegacao={navegacao} estadoDoOlho="normal" />);
    // O jsdom não navega; o ouvinte do documento impede a tentativa depois do componente.
    document.addEventListener("click", (e) => e.preventDefault(), { once: true });
    fireEvent.click(screen.getByRole("link", { name: "Orçamento" }), { ctrlKey: true });
    expect(navegacao.aoIrPara).not.toHaveBeenCalled();
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
