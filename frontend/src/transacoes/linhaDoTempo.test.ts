import { describe, expect, it } from "vitest";

import type { Ganho, Gasto } from "../api/tipos";
import {
  agruparPorDia,
  fatiaDaPagina,
  filtrarPorBusca,
  juntarTransacoes,
  normalizarParaBusca,
  totaisDasTransacoes,
} from "./linhaDoTempo";

function gasto(id: string, data: string, valor: string, descricao = "Gasto", tags: string[] = []): Gasto {
  return { id, conta_id: "c1", valor, descricao, data, categoria: "conforto", tags, origem: "manual", recorrencia_id: null };
}

function ganho(id: string, data: string, valor: string, descricao = "Ganho", tags: string[] = []): Ganho {
  return { id, conta_id: "c1", valor, descricao, data, tags, origem: "manual", recorrencia_id: null };
}

describe("juntarTransacoes", () => {
  it("ordena por data, da mais recente à mais antiga, e no mesmo dia as saídas antes das entradas", () => {
    const juntas = juntarTransacoes(
      [gasto("g1", "2026-04-02", "1.00"), gasto("g2", "2026-04-05", "2.00")],
      [ganho("n1", "2026-04-05", "9.00"), ganho("n2", "2026-04-01", "3.00")],
    );

    expect(juntas.map((t) => t.id)).toEqual(["g2", "n1", "g1", "n2"]);
    expect(juntas.map((t) => t.tipo)).toEqual(["gasto", "ganho", "gasto", "ganho"]);
  });

  it("mantém a ordem original entre itens iguais", () => {
    const juntas = juntarTransacoes(
      [gasto("a", "2026-04-02", "1.00"), gasto("b", "2026-04-02", "1.00")],
      [],
    );

    expect(juntas.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("agruparPorDia", () => {
  it("agrupa por dia mantendo a ordem", () => {
    const grupos = agruparPorDia(
      juntarTransacoes(
        [gasto("g1", "2026-04-05", "1.00"), gasto("g2", "2026-04-02", "2.00")],
        [ganho("n1", "2026-04-05", "9.00")],
      ),
    );

    expect(grupos.map((g) => g.data)).toEqual(["2026-04-05", "2026-04-02"]);
    expect(grupos[0].transacoes.map((t) => t.id)).toEqual(["g1", "n1"]);
    expect(grupos[1].transacoes.map((t) => t.id)).toEqual(["g2"]);
  });

  it("devolve lista vazia sem transações", () => {
    expect(agruparPorDia([])).toEqual([]);
  });
});

describe("normalizarParaBusca", () => {
  it("tira acentos, caixa e espaços sobrando", () => {
    expect(normalizarParaBusca("Café  Mercado")).toBe("cafe mercado");
    expect(normalizarParaBusca("  AÇÚCAR ")).toBe("acucar");
  });
});

describe("filtrarPorBusca", () => {
  const todas = juntarTransacoes(
    [
      gasto("g1", "2026-04-05", "1.00", "Café da manhã", ["padaria"]),
      gasto("g2", "2026-04-04", "2.00", "Almoço", ["restaurante", "pix"]),
    ],
    [ganho("n1", "2026-04-03", "9.00", "Salário", ["trabalho"])],
  );

  it("casa na descrição, sem acento nem caixa", () => {
    expect(filtrarPorBusca(todas, "CAFE").map((t) => t.id)).toEqual(["g1"]);
  });

  it("casa nas tags", () => {
    expect(filtrarPorBusca(todas, "pix").map((t) => t.id)).toEqual(["g2"]);
  });

  it("exige todos os termos e ignora espaços sobrando", () => {
    expect(filtrarPorBusca(todas, "  almoco   pix ").map((t) => t.id)).toEqual(["g2"]);
    expect(filtrarPorBusca(todas, "almoco padaria")).toEqual([]);
  });

  it("casa nas tags sem acento nem caixa", () => {
    const comTag = juntarTransacoes([gasto("g", "2026-04-05", "1.00", "Compra", ["Açaí"])], []);

    expect(filtrarPorBusca(comTag, "acai")).toHaveLength(1);
  });

  it("busca vazia devolve tudo", () => {
    expect(filtrarPorBusca(todas, "   ")).toHaveLength(3);
  });
});

describe("totaisDasTransacoes", () => {
  it("soma entradas e saídas exatamente e dá entradas menos saídas", () => {
    const totais = totaisDasTransacoes(
      juntarTransacoes(
        [gasto("g1", "2026-04-05", "0.10"), gasto("g2", "2026-04-05", "0.20")],
        [ganho("n1", "2026-04-05", "1.00")],
      ),
    );

    expect(totais).toEqual({ entradas: "1.00", saidas: "0.30", saldo: "0.70" });
  });

  it("fica negativo quando as saídas passam das entradas e zerado sem itens", () => {
    expect(totaisDasTransacoes(juntarTransacoes([gasto("g", "2026-04-05", "5.00")], [])).saldo).toBe("-5.00");
    expect(totaisDasTransacoes([])).toEqual({ entradas: "0.00", saidas: "0.00", saldo: "0.00" });
  });
});

describe("fatiaDaPagina", () => {
  const itens = Array.from({ length: 250 }, (_, i) => i);

  it("devolve as 100 primeiras e a contagem restante", () => {
    const pagina = fatiaDaPagina(itens);

    expect(pagina.itens).toHaveLength(100);
    expect(pagina.itens[0]).toBe(0);
    expect(pagina.restantes).toBe(150);
  });

  it("cada página a mais revela mais 100, sem passar do total", () => {
    expect(fatiaDaPagina(itens, 2)).toMatchObject({ restantes: 50 });
    expect(fatiaDaPagina(itens, 3).itens).toHaveLength(250);
    expect(fatiaDaPagina(itens, 3).restantes).toBe(0);
    expect(fatiaDaPagina(itens, 99)).toMatchObject({ restantes: 0 });
    expect(fatiaDaPagina(itens, 0)).toEqual({ itens: [], restantes: 250 });
    expect(fatiaDaPagina(itens, 2, 125).itens).toHaveLength(250);
    expect(fatiaDaPagina([], 1)).toEqual({ itens: [], restantes: 0 });
  });
});
