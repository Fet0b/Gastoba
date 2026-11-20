import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CAMINHOS_DOS_ICONES, Icone, type NomeDoIcone } from "./Icone";

const NOMES = Object.keys(CAMINHOS_DOS_ICONES) as NomeDoIcone[];

describe("Icone", () => {
  it("renderiza o SVG do nome pedido, escondido dos leitores de tela por padrão", () => {
    const { container } = render(<Icone nome="inicio" />);
    const svg = container.querySelector("svg");

    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("role")).toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
    expect(svg?.getAttribute("fill")).toBe("none");
  });

  it("com rótulo vira uma imagem com nome acessível", () => {
    const { container } = render(<Icone nome="alerta" rotulo="Atenção" />);
    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBe("Atenção");
    expect(svg?.getAttribute("aria-hidden")).toBeNull();
  });

  it("aceita o tamanho em pixels", () => {
    const { container } = render(<Icone nome="mais" tamanho={32} />);
    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("width")).toBe("32");
    expect(svg?.getAttribute("height")).toBe("32");
  });

  it("cobre as oito abas, as cinco categorias e as ações", () => {
    const esperados = [
      "inicio", "transacoes", "orcamento", "contas", "faturas", "tags", "outros", "perfil",
      "investimentos", "lazer", "conhecimento", "conforto", "gasto_fixo",
      "mais", "fechar", "adicionar", "entrada", "saida", "alerta", "ok",
    ];
    for (const nome of esperados) expect(NOMES).toContain(nome);
  });

  it.each(NOMES)("o ícone %s tem um caminho não vazio", (nome) => {
    const { container } = render(<Icone nome={nome} />);
    const caminhos = Array.from(container.querySelectorAll("path"));

    expect(caminhos.length).toBeGreaterThan(0);
    for (const caminho of caminhos) expect((caminho.getAttribute("d") ?? "").trim()).not.toBe("");
  });

  it.each(["info", "repetir", "verificado"] as const)("o ícone novo %s existe e é um SVG com caminho", (nome) => {
    expect(NOMES).toContain(nome);
    const { container } = render(<Icone nome={nome} />);
    expect(container.querySelector("svg path")).not.toBeNull();
  });

  it("o ícone novo com rótulo vira imagem", () => {
    const { container } = render(<Icone nome="info" rotulo="Informação" />);
    expect(container.querySelector("svg")?.getAttribute("role")).toBe("img");
  });

  it.each(["aviao", "casa", "carro", "computador", "exclamacao"] as const)(
    "o ícone da caixinha %s existe, em traço e distinto dos demais",
    (nome) => {
      expect(NOMES).toContain(nome);
      const { container } = render(<Icone nome={nome} tamanho={16} rotulo={nome} />);
      expect(container.querySelector("svg")?.getAttribute("stroke")).toBe("currentColor");
      expect(container.querySelectorAll("path").length).toBeGreaterThan(0);
      for (const outro of NOMES.filter((n) => n !== nome)) {
        expect(CAMINHOS_DOS_ICONES[outro].join("|")).not.toBe(CAMINHOS_DOS_ICONES[nome].join("|"));
      }
    },
  );

  it("o cofre (padrão da caixinha) e a exclamação não repetem o alerta nem a informação", () => {
    expect(CAMINHOS_DOS_ICONES.exclamacao).not.toEqual(CAMINHOS_DOS_ICONES.alerta);
    expect(CAMINHOS_DOS_ICONES.exclamacao).not.toEqual(CAMINHOS_DOS_ICONES.info);
  });
});
