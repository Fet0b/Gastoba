import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Caixa } from "./Caixa";
import { Opcao } from "./Opcao";
import { Seletor } from "./Seletor";

const lerCss = (caminho: string): string => readFileSync(join(process.cwd(), "src", caminho), "utf-8");
const css = (arquivo: string) => lerCss(arquivo.replace(/^\.\//, "componentes/Campo/").replace(/^\.\.\//, "componentes/"));

describe("Seletor (070 T017)", () => {
  it("mostra o texto inteiro da opção escolhida em title, porque o campo o corta com reticências", () => {
    render(<Seletor rotulo="Conta" valor="b" aoMudar={() => {}} opcoes={[{ valor: "a", rotulo: "Curta" }, { valor: "b", rotulo: "Banco Exemplo Cartão Black Internacional" }]} />);
    expect(screen.getByLabelText("Conta").getAttribute("title")).toBe("Banco Exemplo Cartão Black Internacional");
  });

  it("sem opção escolhida não tem title", () => {
    render(<Seletor rotulo="Conta" valor="" vazio="Escolha" aoMudar={() => {}} opcoes={[{ valor: "a", rotulo: "Curta" }]} />);
    expect(screen.getByLabelText("Conta").getAttribute("title")).toBeNull();
  });
});

describe("Caixa (070 T017)", () => {
  it("desenha a marca de verificação quando marcada; o rádio não a tem", () => {
    const { container, rerender } = render(<Caixa rotulo="Incluir" marcada={false} aoMudar={() => {}} />);
    expect(container.querySelector("[data-marca]")).toBeNull();
    rerender(<Caixa rotulo="Incluir" marcada aoMudar={() => {}} />);
    expect(container.querySelector("[data-marca] svg")).toBeTruthy();
    const radio = render(<Opcao nome="g" valor="a" titulo="A" selecionada aoMudar={() => {}} />);
    expect(radio.container.querySelector("[data-marca]")).toBeNull();
  });
});

describe("rótulo de campo único (070 T016)", () => {
  it("as legendas e rótulos próprios reutilizam o rótulo de Campo.module.css (13 px, bruma)", () => {
    expect(css("./Campo.module.css")).toMatch(/\.rotulo\s*\{[^}]*var\(--texto-rotulo\)[^}]*var\(--cor-bruma\)/s);
    expect(css("./Campo.module.css")).toMatch(/\.legenda\s*\{[^}]*composes:\s*rotulo/s);
    for (const arquivo of ["./CampoDeValor.module.css", "../Compositor/CampoDeTags.module.css", "../Compositor/GrupoDeChips.module.css"])
      expect(css(arquivo), arquivo).toMatch(/\.rotulo\s*\{[^}]*composes:\s*rotulo from "\.\.?\/Campo\/Campo\.module\.css"|\.rotulo\s*\{[^}]*composes:\s*rotulo from "\.\/Campo\.module\.css"/s);
  });

  it("todo campo tem a borda de camada sobre o fundo veludo, inclusive o de tags", () => {
    expect(css("./Campo.module.css")).toMatch(/\.entrada\s*\{[^}]*border:\s*var\(--borda-de-camada\)/s);
    expect(css("./CampoDeValor.module.css")).toMatch(/\.entrada\s*\{[^}]*border:\s*var\(--borda-de-camada\)/s);
    expect(css("../Compositor/CampoDeTags.module.css")).toMatch(/\.moldura\s*\{[^}]*border:\s*var\(--borda-de-camada\)[^}]*background:\s*var\(--cor-veludo\)/s);
  });
});
