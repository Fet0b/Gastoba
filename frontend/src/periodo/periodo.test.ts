import { afterEach, describe, expect, it, vi } from "vitest";

import {
  anterior,
  dataParaExibicao,
  hojeLocal,
  limites,
  mesDoPeriodo,
  ontemLocal,
  periodoAtual,
  proximo,
  rotulo,
  rotuloDoDia,
} from "./periodo";

/** 23h30 de 10/10/2026 em São Paulo (UTC−3), já 02h30 de 11/10 em UTC. */
const NOITE_DE_10_DE_OUTUBRO = Date.UTC(2026, 9, 11, 2, 30);

function fixarRelogio(instante: number): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(instante);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("limites", () => {
  it.each([
    [{ ano: 2024, mes: 2 }, "2024-02-01", "2024-02-29"],
    [{ ano: 2026, mes: 2 }, "2026-02-01", "2026-02-28"],
    [{ ano: 2026, mes: 10 }, "2026-10-01", "2026-10-31"],
    [{ ano: 2026, mes: 11 }, "2026-11-01", "2026-11-30"],
    [{ ano: 2026, mes: 12 }, "2026-12-01", "2026-12-31"],
  ])("de %o vai de %s a %s", (periodo, inicio, fim) => {
    expect(limites(periodo)).toEqual({ inicio, fim });
  });
});

describe("anterior e proximo", () => {
  it("anterior de janeiro é dezembro do ano anterior", () => {
    expect(anterior({ ano: 2026, mes: 1 })).toEqual({ ano: 2025, mes: 12 });
  });

  it("anterior de outubro é setembro", () => {
    expect(anterior({ ano: 2026, mes: 10 })).toEqual({ ano: 2026, mes: 9 });
  });

  it("proximo de dezembro é janeiro do ano seguinte", () => {
    expect(proximo({ ano: 2026, mes: 12 })).toEqual({ ano: 2027, mes: 1 });
  });

  it("proximo de outubro é novembro", () => {
    expect(proximo({ ano: 2026, mes: 10 })).toEqual({ ano: 2026, mes: 11 });
  });
});

describe("rotulo", () => {
  it("escreve o mês por extenso e o ano", () => {
    expect(rotulo({ ano: 2026, mes: 10 })).toBe("outubro de 2026");
    expect(rotulo({ ano: 2027, mes: 1 })).toBe("janeiro de 2027");
  });
});

describe("relógio local", () => {
  it("hojeLocal usa a data de São Paulo às 23h30, não a de UTC", () => {
    fixarRelogio(NOITE_DE_10_DE_OUTUBRO);
    expect(hojeLocal()).toBe("2026-10-10");
  });

  it("ontemLocal é o dia anterior, virando o mês", () => {
    fixarRelogio(NOITE_DE_10_DE_OUTUBRO);
    expect(ontemLocal()).toBe("2026-10-09");
    fixarRelogio(Date.UTC(2026, 10, 1, 15, 0));
    expect(ontemLocal()).toBe("2026-10-31");
  });

  it("periodoAtual é o mês local", () => {
    fixarRelogio(Date.UTC(2026, 10, 1, 2, 30)); // 31/10 23h30 em São Paulo
    expect(periodoAtual()).toEqual({ ano: 2026, mes: 10 });
  });
});

describe("rotuloDoDia", () => {
  it("diz Hoje, Ontem ou o dia da semana com a data", () => {
    fixarRelogio(NOITE_DE_10_DE_OUTUBRO);
    expect(rotuloDoDia("2026-10-10")).toBe("Hoje");
    expect(rotuloDoDia("2026-10-09")).toBe("Ontem");
    expect(rotuloDoDia("2026-10-02")).toBe("sexta, 2 de outubro");
    expect(rotuloDoDia("2026-10-03")).toBe("sábado, 3 de outubro");
    expect(rotuloDoDia("2026-09-28")).toBe("segunda, 28 de setembro");
  });

  it("diz Ontem na virada do ano e não confunde o mesmo dia de outro ano", () => {
    fixarRelogio(Date.UTC(2027, 0, 1, 2, 30)); // 31/12/2026 23h30 em São Paulo
    expect(rotuloDoDia("2026-12-31")).toBe("Hoje");
    fixarRelogio(Date.UTC(2027, 0, 1, 15, 0)); // 01/01/2027 12h em São Paulo
    expect(rotuloDoDia("2027-01-01")).toBe("Hoje");
    expect(rotuloDoDia("2026-12-31")).toBe("Ontem");
    expect(rotuloDoDia("2026-01-01")).toBe("quinta, 1 de janeiro");
  });

  it("escreve o 29 de fevereiro de ano bissexto", () => {
    fixarRelogio(NOITE_DE_10_DE_OUTUBRO);
    expect(rotuloDoDia("2024-02-29")).toBe("quinta, 29 de fevereiro");
  });
});

describe("mesDoPeriodo", () => {
  it("formata AAAA-MM com zeros à esquerda", () => {
    expect(mesDoPeriodo({ ano: 2026, mes: 10 })).toBe("2026-10");
    expect(mesDoPeriodo({ ano: 2026, mes: 3 })).toBe("2026-03");
    expect(mesDoPeriodo({ ano: 26, mes: 1 })).toBe("0026-01");
  });
});

describe("dataParaExibicao", () => {
  it("troca AAAA-MM-DD por dd/mm/aaaa sem passar por Date", () => {
    expect(dataParaExibicao("2026-08-01")).toBe("01/08/2026");
    expect(dataParaExibicao("2026-12-31")).toBe("31/12/2026");
  });
});

