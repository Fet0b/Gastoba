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

describe("CabecalhoDaTela, ação da página (070 T018)", () => {
  it("a ação fica num bloco próprio, logo depois da identificação, e os controles noutro", () => {
    const { container } = render(
      <CabecalhoDaTela titulo="Investimentos" subtitulo="Seu patrimônio." acao={<button type="button">Ver aportes</button>} acoes={<button type="button">Sino</button>} />,
    );
    const cabecalho = container.querySelector("header")!;
    const blocos = [...cabecalho.children].map((b) => b.getAttribute("data-bloco") ?? b.className);
    expect(blocos.length).toBe(3);
    expect(cabecalho.children[1].querySelector("button")?.textContent).toBe("Ver aportes");
    expect(cabecalho.children[2].querySelector("button")?.textContent).toBe("Sino");
  });

  it("sem ação não cria o bloco", () => {
    const { container } = render(<CabecalhoDaTela titulo="Tags" subtitulo="x" acoes={<button type="button">Sino</button>} />);
    expect(container.querySelector("header")!.children.length).toBe(2);
  });
});

describe("CabecalhoDaTela, ajustes do portão T022a", () => {
  it("marca quando o sino é o único controle de cabeçalho e pode acompanhar o título", () => {
    const { container } = render(
      <CabecalhoDaTela
        titulo="Investimentos"
        subtitulo="Acompanhe suas posições."
        sininhoNaLinhaDoTitulo
        acoes={<button type="button" aria-label="Avisos: nenhum">Sino</button>}
      />,
    );

    const cabecalho = container.querySelector("header[data-cabecalho-da-tela]");
    expect(cabecalho?.getAttribute("data-sininho-unico")).toBe("");
    expect(cabecalho?.querySelector('[aria-label="Avisos: nenhum"]')).not.toBeNull();
  });

  it("marca o link terciário para alinhá-lo com o título sem alterar a variante", () => {
    const { container } = render(
      <CabecalhoDaTela
        titulo="Investimentos"
        subtitulo="Acompanhe suas posições."
        acao={<button type="button" data-variante="terciario">Ver aportes</button>}
      />,
    );

    expect(container.querySelector("[data-acao-terciaria] button[data-variante='terciario']")).not.toBeNull();
  });
});
