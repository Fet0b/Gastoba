import { describe, expect, it } from "vitest";

import { caminhoDaFatia, prepararPizza } from "./pizza";

const entrada = (chave: string, valor: string) => ({ chave, rotulo: chave, valor });

describe("prepararPizza", () => {
  it("calcula fração, percentual e posição, na ordem dada", () => {
    const fatias = prepararPizza([entrada("a", "75.00"), entrada("b", "25.00")]);
    expect(fatias.map((f) => [f.chave, f.fracao, f.percentual, f.inicio, f.fim])).toEqual([
      ["a", 0.75, "75%", 0, 0.75],
      ["b", 0.25, "25%", 0.75, 1],
    ]);
  });

  it("omite fatias zeradas e marca <1% quando existe mas é pequena", () => {
    const fatias = prepararPizza([entrada("a", "999.99"), entrada("b", "0.01"), entrada("c", "0.00")]);
    expect(fatias.map((f) => f.chave)).toEqual(["a", "b"]);
    expect(fatias[1].percentual).toBe("<1%");
  });

  it("sem valor não há fatias", () => {
    expect(prepararPizza([])).toEqual([]);
    expect(prepararPizza([entrada("a", "0.00")])).toEqual([]);
  });
});

describe("caminhoDaFatia", () => {
  it("é um caminho fechado de rosca", () => {
    const caminho = caminhoDaFatia(50, 40, 25, 0, 0.25);
    expect(caminho.startsWith("M 50 10 A 40 40 0 0 1 90 50")).toBe(true);
    expect(caminho.endsWith("Z")).toBe(true);
  });

  it("a fatia de 60% usa o arco grande", () => {
    expect(caminhoDaFatia(50, 40, 25, 0, 0.6)).toContain("A 40 40 0 1 1");
  });

  it("a volta inteira vira dois arcos, para o SVG desenhar", () => {
    const caminho = caminhoDaFatia(50, 40, 25, 0, 1);
    expect(caminho.match(/ A 40 40/g)).toHaveLength(2);
  });

  it("na volta inteira o furo é fechado por dois arcos, não por uma reta que tampa metade", () => {
    const caminho = caminhoDaFatia(50, 40, 25, 0, 1);
    expect(caminho.match(/ A 25 25/g)).toHaveLength(2);
    expect(caminho.match(/ L /g)).toHaveLength(1);
  });
});
