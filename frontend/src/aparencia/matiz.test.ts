import { describe, expect, it } from "vitest";
import { CORES_PRONTAS, nomeDaMatiz, semanticaProxima } from "./matiz";

describe("matiz", () => {
  it("dá nome a toda matiz de 0 a 359, inclusive nas pontas", () => {
    for (let m = 0; m < 360; m += 1) expect(nomeDaMatiz(m)).not.toBe("");
    expect(nomeDaMatiz(0)).toBe("Vermelho");
    expect(nomeDaMatiz(359)).toBe("Vermelho");
    expect(nomeDaMatiz(258)).toBe("Roxo");
  });

  it("as cores prontas têm nome coerente com a faixa", () => {
    expect(CORES_PRONTAS).toHaveLength(8);
    for (const { matiz, nome } of CORES_PRONTAS) expect(nomeDaMatiz(matiz)).toBe(nome);
  });

  it("avisa a menos de 20 graus de uma cor semântica, também na volta do círculo", () => {
    expect(semanticaProxima(150)).toContain("verde");
    expect(semanticaProxima(5)).toContain("vermelho");
    expect(semanticaProxima(355)).toContain("vermelho");
    expect(semanticaProxima(48)).toContain("âmbar");
    expect(semanticaProxima(258)).toBeNull();
    expect(semanticaProxima(215)).toBeNull();
  });
});
