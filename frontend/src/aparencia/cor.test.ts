import { describe, expect, it } from "vitest";
import { comAlfa, contraste, deHex, hex, hslParaRgb, rgbParaHsl, sobrepor } from "./cor";

describe("cor", () => {
  it("contraste de preto e branco é 21:1 e de cores iguais é 1:1", () => {
    expect(contraste([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contraste([10, 20, 30], [10, 20, 30])).toBeCloseTo(1, 5);
  });

  it("confere um valor de referência conhecido (cinza #777 sobre branco, 4,48:1)", () => {
    expect(contraste(deHex("#777777"), [255, 255, 255])).toBeCloseTo(4.48, 2);
  });

  it("converte HSL em RGB nas cores primárias e nos cinzas", () => {
    expect(hslParaRgb(0, 100, 50)).toEqual([255, 0, 0]);
    expect(hslParaRgb(120, 100, 50)).toEqual([0, 255, 0]);
    expect(hslParaRgb(240, 100, 50)).toEqual([0, 0, 255]);
    expect(hslParaRgb(77, 0, 50)).toEqual([128, 128, 128]);
    expect(hslParaRgb(360, 100, 50)).toEqual([255, 0, 0]);
    expect(hslParaRgb(-120, 100, 50)).toEqual([0, 0, 255]);
  });

  it("ida e volta por HSL devolve o mesmo hexadecimal", () => {
    for (const cor of ["#0c0814", "#8b5cf6", "#c9b8ff", "#eee9fb", "#9a8fb8", "#976cf7"]) {
      const [h, s, l] = rgbParaHsl(deHex(cor));
      expect(hex(hslParaRgb(h, s, l))).toBe(cor);
    }
  });

  it("formata hexadecimal e rgb com alfa", () => {
    expect(hex([12, 8, 20])).toBe("#0c0814");
    expect(comAlfa([201, 184, 255], 0.18)).toBe("rgb(201 184 255 / 0.18)");
  });

  it("compõe a cor com alfa sobre o fundo", () => {
    expect(sobrepor([255, 255, 255], 0.5, [0, 0, 0])).toEqual([128, 128, 128]);
    expect(sobrepor([9, 9, 9], 0, [1, 2, 3])).toEqual([1, 2, 3]);
  });
});
