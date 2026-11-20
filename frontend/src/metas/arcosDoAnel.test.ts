import { describe, expect, it } from "vitest";

import { arcosDoAnel } from "./arcosDoAnel";

describe("arcosDoAnel", () => {
  it("exemplo da spec: 40% gasto e 30% guardado", () => {
    expect(arcosDoAnel(40, 30)).toEqual({ gasto: 40, rachurado: 30 });
  });

  it("o rachurado ocupa só o que falta para fechar o anel", () => {
    expect(arcosDoAnel(80, 50)).toEqual({ gasto: 80, rachurado: 20 });
    expect(arcosDoAnel(0, 250)).toEqual({ gasto: 0, rachurado: 100 });
  });

  it("gasto cheio ou acima de 100 não deixa espaço para o rachurado", () => {
    expect(arcosDoAnel(100, 30)).toEqual({ gasto: 100, rachurado: 0 });
    expect(arcosDoAnel(116, 30)).toEqual({ gasto: 100, rachurado: 0 });
  });

  it("sem guardado, sem rachurado", () => {
    expect(arcosDoAnel(40, 0)).toEqual({ gasto: 40, rachurado: 0 });
    expect(arcosDoAnel(40, -5)).toEqual({ gasto: 40, rachurado: 0 });
  });

  it("uso nulo ou negativo conta como zero", () => {
    expect(arcosDoAnel(null, 20)).toEqual({ gasto: 0, rachurado: 20 });
    expect(arcosDoAnel(-3, 20)).toEqual({ gasto: 0, rachurado: 20 });
  });

  it("sem renda o gasto é zero, como o anel já faz", () => {
    expect(arcosDoAnel(null, 0, "sem_renda")).toEqual({ gasto: 0, rachurado: 0 });
    expect(arcosDoAnel(40, 10, "sem_renda")).toEqual({ gasto: 0, rachurado: 10 });
  });
});
