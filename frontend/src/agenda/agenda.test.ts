import { describe, expect, it } from "vitest";

import type { Recorrencia } from "../api/tipos";
import { comprometidoPorMes, proximaOcorrencia, proximosLancamentos } from "./agenda";

function rec(extra: Partial<Recorrencia> = {}): Recorrencia {
  return {
    id: "r1",
    tipo: "gasto",
    conta_id: "c1",
    valor: "100.00",
    descricao: "Aluguel",
    dia_do_mes: 10,
    inicio: "2026-01-01",
    fim: null,
    categoria: "gasto_fixo",
    tags: [],
    ativa: true,
    ...extra,
  };
}

describe("proximaOcorrencia", () => {
  it("devolve o dia do mês corrente quando ainda não passou", () => {
    expect(proximaOcorrencia(rec({ dia_do_mes: 20 }), "2026-06-10")).toBe("2026-06-20");
  });

  it("exclui a ocorrência de hoje (o servidor já criou)", () => {
    expect(proximaOcorrencia(rec({ dia_do_mes: 10 }), "2026-06-10")).toBe("2026-07-10");
  });

  it("dia 31 em fevereiro vale o último dia (28 e 29)", () => {
    expect(proximaOcorrencia(rec({ dia_do_mes: 31 }), "2026-02-01")).toBe("2026-02-28");
    expect(proximaOcorrencia(rec({ dia_do_mes: 31 }), "2028-02-01")).toBe("2028-02-29");
  });

  it("dia 31 depois do fim de um mês curto vai para o mês seguinte", () => {
    expect(proximaOcorrencia(rec({ dia_do_mes: 31 }), "2026-04-30")).toBe("2026-05-31");
  });

  it("vira o ano de dezembro para janeiro", () => {
    expect(proximaOcorrencia(rec({ dia_do_mes: 15 }), "2026-12-20")).toBe("2027-01-15");
  });

  it("com início no futuro, começa na primeira data a partir do início", () => {
    const r = rec({ dia_do_mes: 5, inicio: "2026-09-10" });
    expect(proximaOcorrencia(r, "2026-06-01")).toBe("2026-10-05");
    expect(proximaOcorrencia(rec({ dia_do_mes: 12, inicio: "2026-09-10" }), "2026-06-01")).toBe(
      "2026-09-12",
    );
  });

  it("o início é inclusivo", () => {
    expect(proximaOcorrencia(rec({ dia_do_mes: 10, inicio: "2026-09-10" }), "2026-06-01")).toBe(
      "2026-09-10",
    );
  });

  it("devolve nulo quando o fim vem antes da próxima data", () => {
    expect(proximaOcorrencia(rec({ dia_do_mes: 10, fim: "2026-06-30" }), "2026-06-10")).toBeNull();
  });

  it("o fim é inclusivo", () => {
    expect(proximaOcorrencia(rec({ dia_do_mes: 20, fim: "2026-06-20" }), "2026-06-10")).toBe(
      "2026-06-20",
    );
  });

  it("devolve nulo para a recorrência encerrada", () => {
    expect(proximaOcorrencia(rec({ ativa: false }), "2026-06-10")).toBeNull();
  });
});

describe("proximosLancamentos", () => {
  it("ordena por data e, na mesma data, por descrição", () => {
    const lista = proximosLancamentos(
      [
        rec({ id: "a", descricao: "Zeta", dia_do_mes: 15 }),
        rec({ id: "b", descricao: "Beta", dia_do_mes: 15 }),
        rec({ id: "c", descricao: "Cedo", dia_do_mes: 12 }),
      ],
      "2026-06-10",
    );
    expect(lista.map((l) => l.recorrencia.id)).toEqual(["c", "b", "a"]);
    expect(lista.map((l) => l.data)).toEqual(["2026-06-12", "2026-06-15", "2026-06-15"]);
    expect(lista.map((l) => l.diasAte)).toEqual([2, 5, 5]);
  });

  it("corta em 30 dias, inclusive o trigésimo", () => {
    const r = [rec({ dia_do_mes: 10 })]; // de 10/06 para 10/07: 30 dias
    const lista = proximosLancamentos(r, "2026-06-10");
    expect(lista.map((l) => l.diasAte)).toEqual([30]);
    expect(proximosLancamentos(r, "2026-06-10", 29)).toEqual([]);
    // de 10/12 para 10/01 são 31 dias: fora
    expect(proximosLancamentos(r, "2026-12-10")).toEqual([]);
  });

  it("aceita outro prazo", () => {
    const lista = proximosLancamentos([rec({ dia_do_mes: 20 })], "2026-06-10", 5);
    expect(lista).toEqual([]);
  });

  it("ignora as não vigentes", () => {
    const lista = proximosLancamentos(
      [
        rec({ id: "a", ativa: false, dia_do_mes: 12 }),
        rec({ id: "b", fim: "2026-06-11", dia_do_mes: 12 }),
        rec({ id: "c", dia_do_mes: 12 }),
      ],
      "2026-06-10",
    );
    expect(lista.map((l) => l.recorrencia.id)).toEqual(["c"]);
  });

  it("conta os dias na virada de ano", () => {
    const [primeiro] = proximosLancamentos([rec({ dia_do_mes: 5 })], "2026-12-28");
    expect(primeiro.data).toBe("2027-01-05");
    expect(primeiro.diasAte).toBe(8);
  });
});

describe("comprometidoPorMes", () => {
  it("soma ganhos e gastos vigentes e o saldo", () => {
    const r = comprometidoPorMes(
      [
        rec({ id: "a", tipo: "ganho", valor: "5000.10", categoria: null }),
        rec({ id: "b", tipo: "gasto", valor: "1500.05" }),
        rec({ id: "c", tipo: "gasto", valor: "200.00", fim: "2026-06-10" }),
        rec({ id: "d", tipo: "gasto", valor: "999.00", ativa: false }),
        rec({ id: "e", tipo: "gasto", valor: "50.00", fim: "2026-06-09" }),
      ],
      "2026-06-10",
    );
    expect(r).toEqual({ ganhos: "5000.10", gastos: "1700.05", saldo: "3300.05" });
  });

  it("o saldo pode ser negativo", () => {
    const r = comprometidoPorMes(
      [
        rec({ id: "a", tipo: "ganho", valor: "100.00", categoria: null }),
        rec({ id: "b", tipo: "gasto", valor: "250.50" }),
      ],
      "2026-06-10",
    );
    expect(r.saldo).toBe("-150.50");
  });

  it("sem recorrências, tudo zero", () => {
    expect(comprometidoPorMes([], "2026-06-10")).toEqual({
      ganhos: "0.00",
      gastos: "0.00",
      saldo: "0.00",
    });
  });
});
