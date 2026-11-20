import { describe, expect, it } from "vitest";

import { cicloDaFatura, diaDoMesDe } from "./cicloDaFatura";

describe("cicloDaFatura", () => {
  it("conta o dia de hoje dentro do ciclo, contando os dois extremos", () => {
    // 16/10 a 15/11 são 31 dias; em 05/11 já passaram 21 deles.
    expect(cicloDaFatura("2026-10-16", "2026-11-15", "2026-11-05")).toEqual({ dia: 21, dias: 31, percentual: 67 });
  });

  it("no primeiro dia do ciclo conta 1 e no último conta todos", () => {
    expect(cicloDaFatura("2026-10-16", "2026-11-15", "2026-10-16")).toEqual({ dia: 1, dias: 31, percentual: 3 });
    expect(cicloDaFatura("2026-10-16", "2026-11-15", "2026-11-15")).toEqual({ dia: 31, dias: 31, percentual: 100 });
  });

  it("antes do início fica em zero e depois do fechamento fica cheio", () => {
    expect(cicloDaFatura("2026-10-16", "2026-11-15", "2026-10-01")).toEqual({ dia: 0, dias: 31, percentual: 0 });
    expect(cicloDaFatura("2026-10-16", "2026-11-15", "2026-12-20")).toEqual({ dia: 31, dias: 31, percentual: 100 });
  });

  it("atravessa a virada de ano e o ano bissexto sem errar o dia", () => {
    expect(cicloDaFatura("2027-12-16", "2028-01-15", "2028-01-01")).toEqual({ dia: 17, dias: 31, percentual: 54 });
    expect(cicloDaFatura("2028-02-01", "2028-02-29", "2028-02-29")).toEqual({ dia: 29, dias: 29, percentual: 100 });
  });

  it("sem início, ou com o fechamento antes do início, não há ciclo para mostrar", () => {
    expect(cicloDaFatura(null, "2026-11-15", "2026-11-05")).toBeNull();
    expect(cicloDaFatura("2026-11-16", "2026-11-15", "2026-11-20")).toBeNull();
  });
});

describe("diaDoMesDe", () => {
  it("devolve o dia sem zero à esquerda", () => {
    expect(diaDoMesDe("2026-11-05")).toBe(5);
    expect(diaDoMesDe("2026-11-22")).toBe(22);
  });
});
