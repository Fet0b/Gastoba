import { describe, expect, it } from "vitest";

import type { Gasto, MovimentoDeInvestimento, TransferenciaEntreContas } from "../api/tipos";
import { lancamentosDaMeta } from "./lancamentosDaMeta";

function gasto(extra: Partial<Gasto> = {}): Gasto {
  return {
    id: "g1",
    conta_id: "c1",
    valor: "100.00",
    valor_coberto: "0.00",
    coberturas: [],
    descricao: "Cinema",
    data: "2026-11-03",
    categoria: "lazer",
    tags: [],
    origem: "manual",
    recorrencia_id: null,
    ...extra,
  };
}

function movimento(extra: Partial<MovimentoDeInvestimento> = {}): MovimentoDeInvestimento {
  return {
    id: "m1",
    conta_id: "c1",
    investimento_id: null,
    tipo: "aporte",
    origem: "open_finance",
    descricao: "Aporte",
    valor: "50.00",
    data: "2026-11-02",
    categoria: "lazer",
    revisao_pendente: false,
    transacao_importada_id: null,
    destinacoes: [],
    ...extra,
  };
}

describe("lancamentosDaMeta", () => {
  it("categoria lista só gastos, mesmo com aporte categorizado legado", () => {
    const itens = lancamentosDaMeta("lazer", [gasto()], [movimento()]);
    expect(itens.map((i) => [i.id, i.origem, i.valor])).toEqual([
      ["g1", "gasto", "100.00"],
    ]);
  });

  it("usa o valor líquido do gasto e exclui o totalmente coberto", () => {
    const itens = lancamentosDaMeta(
      "lazer",
      [
        gasto({ id: "parcial", valor_coberto: "30.00" }),
        gasto({ id: "inteiro", valor_coberto: "100.00" }),
      ],
      [],
    );
    expect(itens).toHaveLength(1);
    expect(itens[0].id).toBe("parcial");
    expect(itens[0].valor).toBe("70.00");
  });

  it("exclui saldo inicial, resgate e aporte de outra categoria ou sem categoria", () => {
    const itens = lancamentosDaMeta(
      "lazer",
      [gasto({ id: "outro", categoria: "conforto" })],
      [
        movimento({ id: "inicial", origem: "saldo_inicial" }),
        movimento({ id: "resgate", tipo: "resgate" }),
        movimento({ id: "outra", categoria: "conforto" }),
        movimento({ id: "sem", categoria: null }),
      ],
    );
    expect(itens).toEqual([]);
  });

  it("Liberdade financeira não presume dinheiro novo em aportes de posição ou gastos legados", () => {
    const itens = lancamentosDaMeta(
      "liberdade_financeira",
      [gasto({ id: "legado", categoria: "investimentos" }), gasto({ id: "lazer" })],
      [
        movimento({ id: "a1", categoria: null }),
        movimento({ id: "a2", categoria: "lazer" }),
        movimento({ id: "inicial", origem: "saldo_inicial", categoria: null }),
        movimento({ id: "resgate", tipo: "resgate", categoria: null }),
      ],
    );
    expect(itens).toEqual([]);
  });

  it("ordena por data decrescente e, no empate, por descrição crescente", () => {
    const itens = lancamentosDaMeta(
      "lazer",
      [
        gasto({ id: "a", data: "2026-11-01", descricao: "Zebra" }),
        gasto({ id: "b", data: "2026-11-05", descricao: "Teatro" }),
        gasto({ id: "c", data: "2026-11-05", descricao: "Bar" }),
      ],
      [],
    );
    expect(itens.map((i) => i.id)).toEqual(["c", "b", "a"]);
  });
});

describe("aporte dividido entre caixinhas vinculadas e não vinculadas", () => {
  const aporte: MovimentoDeInvestimento = {
    id: "a", conta_id: "c", investimento_id: "i", tipo: "aporte", categoria: null, revisao_pendente: false,
    transacao_importada_id: null, origem: "open_finance", valor: "5000.00", descricao: "Aporte fictício", data: "2026-11-10",
    destinacoes: [
      { tag: "computador", valor: "3500.00", categoria: "conforto", coberto: null },
      { tag: "patrimonio", valor: "1500.00", categoria: null, coberto: null },
    ],
  };

  it("aporte vinculado é realocação de posição, fora das despesas e do dinheiro novo", () => {
    expect(lancamentosDaMeta("conforto", [], [aporte]).map((l) => l.valor)).toEqual([]);
    expect(lancamentosDaMeta("liberdade_financeira", [], [aporte])).toEqual([]);
    expect(lancamentosDaMeta("lazer", [], [aporte])).toEqual([]);
  });
});


it("o detalhe financeiro lista transferências líquidas, inclusive retiradas, sem repetição pelas posições", () => {
 const base: TransferenciaEntreContas = { id: "t1", conta_origem_id: "corrente", conta_destino_id: "corretora", valor: "300.00", data: "2026-11-04", aporte_liquido: "300.00", papel_origem: "corrente", papel_destino: "investimento", transacao_origem_id: "s1", transacao_destino_id: "e1", competencia_provisoria: false };
 const retirada: TransferenciaEntreContas = { ...base, id: "t2", aporte_liquido: "-400.00", valor: "400.00", papel_origem: "investimento", papel_destino: "corrente", data: "2026-11-05" };
 const interna: TransferenciaEntreContas = { ...base, id: "interna", aporte_liquido: "0.00" };
 const detalhe = lancamentosDaMeta("liberdade_financeira", [], [movimento()], [base, retirada, interna]);
 expect(detalhe.map(l => [l.id, l.valor, l.origem])).toEqual([["t2", "-400.00", "transferencia"], ["t1", "300.00", "transferencia"]]);
 expect(lancamentosDaMeta("lazer", [], [], [base])).toEqual([]);
});
