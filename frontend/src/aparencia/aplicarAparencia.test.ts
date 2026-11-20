import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Aparencia } from "../api/tipos";
import { aplicarAparencia } from "./aplicarAparencia";
import { TEXTURAS } from "./texturas";

const PADRAO: Aparencia = {
  matiz: 258,
  intensidade: "media",
  textura: "nenhuma",
  nome: "Gastoba",
  marca: "olho",
  personalizada: false,
};
const ESCOLHA: Aparencia = {
  matiz: 12,
  intensidade: "viva",
  textura: "grade",
  nome: "Meu cofre",
  marca: "cofre",
  personalizada: true,
};
const raiz = () => document.documentElement.style;

describe("aplicarAparencia", () => {
  beforeEach(() => {
    document.title = "Gastoba";
  });
  afterEach(() => aplicarAparencia(null));

  it("escreve a paleta, a textura e o título", () => {
    aplicarAparencia(ESCOLHA);
    expect(raiz().getPropertyValue("--cor-noite")).toMatch(/^#[0-9a-f]{6}$/);
    expect(raiz().getPropertyValue("--cor-ametista")).not.toBe("#8b5cf6");
    expect(raiz().getPropertyValue("--textura-da-pagina")).toBe(TEXTURAS.grade);
    expect(document.title).toBe("Meu cofre");
  });

  it("null remove tudo o que foi escrito e restaura o título", () => {
    aplicarAparencia(ESCOLHA);
    aplicarAparencia(null);
    expect(raiz().cssText).toBe("");
    expect(document.title).toBe("Gastoba");
  });

  it("a aparência padrão não escreve nada", () => {
    aplicarAparencia(PADRAO);
    expect(raiz().cssText).toBe("");
    expect(document.title).toBe("Gastoba");
  });

  it("trocar de uma aparência para outra não deixa variável da anterior", () => {
    aplicarAparencia(ESCOLHA);
    aplicarAparencia({ ...ESCOLHA, matiz: 258, intensidade: "media", textura: "nenhuma", nome: "Outro" });
    expect(raiz().getPropertyValue("--cor-noite")).toBe("");
    expect(raiz().getPropertyValue("--textura-da-pagina")).toBe("");
    expect(document.title).toBe("Outro");
    aplicarAparencia(null);
    expect(document.title).toBe("Gastoba");
  });
});

describe("TEXTURAS", () => {
  it("tem as cinco texturas, só gradientes CSS, e nenhuma é imagem externa", () => {
    expect(Object.keys(TEXTURAS)).toEqual(["nenhuma", "pontos", "linhas", "grade", "grao"]);
    expect(TEXTURAS.nenhuma).toBe("none");
    for (const [codigo, valor] of Object.entries(TEXTURAS)) {
      if (codigo !== "nenhuma") expect(valor).toMatch(/gradient\(/);
      expect(valor).not.toMatch(/url\(/);
    }
  });
});
