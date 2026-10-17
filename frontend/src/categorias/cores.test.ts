import { describe, expect, it } from "vitest";

import { COR_DE_CATEGORIA_DESCONHECIDA, corDaCategoria } from "./cores";

describe("corDaCategoria", () => {
  it.each([
    ["investimentos", "#5BD6B0"],
    ["lazer", "#E879F9"],
    ["conhecimento", "#60A5FA"],
    ["conforto", "#FBBF24"],
    ["gasto_fixo", "#B7A8E8"],
  ])("%s tem a cor %s", (codigo, cor) => {
    expect(corDaCategoria(codigo)).toBe(cor);
  });

  it.each(["viagem", "", "constructor", "toString"])(
    "código desconhecido %j usa Bruma",
    (codigo) => {
      expect(corDaCategoria(codigo)).toBe("#9A8FB8");
      expect(COR_DE_CATEGORIA_DESCONHECIDA).toBe("#9A8FB8");
    },
  );
});
