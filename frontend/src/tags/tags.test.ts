import { describe, expect, it } from "vitest";

import { aparar, LIMITE_DE_TAGS, normalizarTag, validarTag } from "./tags";

describe("normalizarTag", () => {
  it.each([
    ["  Pix ", "pix"],
    ["  Mercado  Livre ", "mercado livre"],
    ["IFOOD", "ifood"],
    ["a\t\tb", "a b"],
    ["   ", ""],
    ["", ""],
    ["ÁGUA  e Luz", "água e luz"],
    ["\u{a0}Pão\u{3000}Doce\u{2009}", "pão doce"],
  ])("%j vira %j", (texto, tag) => {
    expect(normalizarTag(texto)).toBe(tag);
  });

  it("trata como espaço exatamente o que o str.split() do backend trata", () => {
    // U+001C e U+0085 são espaços no Python (e não no `\s` do JavaScript).
    expect(normalizarTag("a\u001cb")).toBe("a b");
    expect(normalizarTag("a\u0085b")).toBe("a b");
    // U+FEFF não é espaço no Python: fica e a validação o recusa, como no backend.
    expect(normalizarTag("a\u{feff}b")).toBe("a\u{feff}b");
    expect(validarTag(normalizarTag("a\u{feff}b"))).toBeTypeOf("string");
  });
});

describe("validarTag", () => {
  it("aceita uma tag comum", () => {
    expect(validarTag("pix")).toBeNull();
  });

  it("aceita 30 caracteres e recusa 31", () => {
    expect(validarTag("a".repeat(30))).toBeNull();
    expect(validarTag("a".repeat(31))).toBeTypeOf("string");
  });

  it("conta um emoji como um caractere", () => {
    expect(validarTag(`${"a".repeat(29)}😀`)).toBeNull();
    expect(validarTag(`${"a".repeat(30)}😀`)).toBeTypeOf("string");
  });

  it("segue o backend com emojis compostos", () => {
    // O seletor de variação (U+FE0F) é imprimível; o ZWJ (U+200D) não é, e o
    // backend recusa emojis de família ou profissão.
    expect(validarTag("❤\u{fe0f}")).toBeNull();
    expect(validarTag("👨\u{200d}👩\u{200d}👧")).toBeTypeOf("string");
  });

  it("recusa a tag vazia", () => {
    expect(validarTag("")).toBeTypeOf("string");
  });

  it("recusa caracteres de controle e não imprimíveis", () => {
    expect(validarTag("pi\u0007x")).toBeTypeOf("string");
    expect(validarTag("pi\u{200b}x")).toBeTypeOf("string");
  });

  it("aceita espaço comum entre palavras e acentos", () => {
    expect(validarTag("mercado livre")).toBeNull();
    expect(validarTag("pão de açúcar")).toBeNull();
  });
});

describe("aparar", () => {
  it.each([
    ["  Nubank  ", "Nubank"],
    ["\u{a0}Mercado\u{3000}", "Mercado"],
    ["a\u001c", "a"],
    ["   ", ""],
    ["Mercado  Livre", "Mercado  Livre"],
    ["\u{feff}x", "\u{feff}x"],
  ])("%j vira %j, como o str.strip() do backend", (texto, aparado) => {
    expect(aparar(texto)).toBe(aparado);
  });
});

describe("LIMITE_DE_TAGS", () => {
  it("é 10, como no backend", () => {
    expect(LIMITE_DE_TAGS).toBe(10);
  });
});
