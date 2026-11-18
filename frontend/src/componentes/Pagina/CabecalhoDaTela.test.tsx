import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CabecalhoDaTela } from "./CabecalhoDaTela";

describe("CabecalhoDaTela", () => {
  it("sem dica nem ações, mostra só o título e o subtítulo", () => {
    const { container } = render(<CabecalhoDaTela titulo="Contas" subtitulo="Seu dinheiro." />);

    expect(screen.getByRole("heading", { level: 2, name: "Contas" })).toBeTruthy();
    expect(screen.getByText("Seu dinheiro.")).toBeTruthy();
    expect(container.querySelector("[data-dica]")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("com dica, mostra o botão 'Sobre {assunto}' com o texto ligado por aria-describedby", () => {
    render(
      <CabecalhoDaTela
        titulo="Tags"
        subtitulo="Para onde vai."
        dica={{ assunto: "a divisão por tags", texto: "O valor se divide entre as tags." }}
      />,
    );

    const botao = screen.getByRole("button", { name: "Sobre a divisão por tags" });
    const texto = document.getElementById(botao.getAttribute("aria-describedby") ?? "");
    expect(texto?.textContent).toBe("O valor se divide entre as tags.");
  });

  it("com ações, renderiza-as", () => {
    render(
      <CabecalhoDaTela titulo="Investimentos" subtitulo="Seu patrimônio." acoes={<button type="button">Ver tudo</button>} />,
    );

    expect(screen.getByRole("button", { name: "Ver tudo" })).toBeTruthy();
  });
});

 it("agrupa título, dica, subtítulo e ações num cabeçalho identificável",()=>{const {container}=render(<CabecalhoDaTela titulo="Contas" subtitulo="Seu dinheiro" acoes={<button>Ação</button>}/>);expect(container.querySelector("header[data-cabecalho-da-tela]")).toBeTruthy();expect(container.querySelector("header")?.contains(screen.getByRole("button",{name:"Ação"}))).toBe(true);});
