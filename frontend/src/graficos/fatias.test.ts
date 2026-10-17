import { describe, expect, it } from "vitest";

import type { FatiaPorTag } from "../api/tipos";
import { agruparFatias, fracaoDe, rotuloDoPercentual } from "./fatias";

function fatias(...pares: [string | null, string][]): FatiaPorTag[] {
  return pares.map(([tag, valor]) => ({ tag, valor }));
}

describe("agruparFatias", () => {
  it("com poucas tags, mantém todas como estão", () => {
    const grupos = agruparFatias(fatias(["a", "30.00"], ["b", "20.00"], ["c", "10.00"]));

    expect(grupos.map((g) => g.rotulo)).toEqual(["a", "b", "c"]);
    expect(grupos.every((g) => g.tipo === "tag")).toBe(true);
  });

  it("mantém as 4 maiores e as cinco tags cabem sem 'Outras'", () => {
    const grupos = agruparFatias(
      fatias(["a", "5.00"], ["b", "4.00"], ["c", "3.00"], ["d", "2.00"], ["e", "1.00"]),
    );

    expect(grupos.map((g) => g.rotulo)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("com 12 tags, soma as 8 menores em 'Outras (8 tags)'", () => {
    const doze = Array.from({ length: 12 }, (_, i): [string, string] => [`t${i}`, `${12 - i}.50`]);

    const grupos = agruparFatias(fatias(...doze));

    expect(grupos.map((g) => g.rotulo)).toEqual(["t0", "t1", "t2", "t3", "Outras (8 tags)"]);
    expect(grupos[4]).toMatchObject({ tipo: "outras", valor: "40.00" });
  });

  it("mantém 'Sem tag' separada, no fim, e conta no máximo 6 fatias", () => {
    const grupos = agruparFatias(
      fatias(["a", "9.00"], [null, "8.00"], ["b", "7.00"], ["c", "6.00"], ["d", "5.00"], ["e", "4.00"], ["f", "3.00"]),
    );

    expect(grupos.map((g) => g.rotulo)).toEqual(["a", "b", "c", "d", "Outras (2 tags)", "Sem tag"]);
    expect(grupos.at(-1)).toMatchObject({ tipo: "sem_tag", valor: "8.00" });
  });

  it("sem fatias, devolve vazio", () => {
    expect(agruparFatias([])).toEqual([]);
  });
});

describe("fracaoDe", () => {
  it("calcula em BigInt e devolve de 0 a 1", () => {
    expect(fracaoDe("25.00", "100.00")).toBe(0.25);
    expect(fracaoDe("0.01", "3.00")).toBeCloseTo(0.003333, 6);
    expect(fracaoDe("100.00", "100.00")).toBe(1);
  });

  it("total zero dá zero", () => {
    expect(fracaoDe("0.00", "0.00")).toBe(0);
  });

  it("as frações de um total dividido somam perto de 1", () => {
    const soma = ["33.34", "33.33", "33.33"].reduce((s, v) => s + fracaoDe(v, "100.00"), 0);

    expect(soma).toBeCloseTo(1, 5);
  });
});

describe("rotuloDoPercentual", () => {
  it("arredonda para inteiro e avisa quando é menor que 1%", () => {
    expect(rotuloDoPercentual(0.4)).toBe("40%");
    expect(rotuloDoPercentual(0.3333)).toBe("33%");
    expect(rotuloDoPercentual(0.004)).toBe("<1%");
    expect(rotuloDoPercentual(0)).toBe("0%");
  });
});
