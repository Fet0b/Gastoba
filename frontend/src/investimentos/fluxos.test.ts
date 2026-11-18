import { describe, expect, it } from "vitest";

import type { MovimentoDeInvestimento, PontoDoHistorico } from "../api/tipos";
import { fluxoLiquido } from "./fluxos";

function movimento(dados: Partial<MovimentoDeInvestimento>): MovimentoDeInvestimento {
  return {
    categoria: null,
    revisao_pendente: false,
    transacao_importada_id: null,
    id: "m",
    conta_id: "c",
    investimento_id: "i1",
    tipo: "aporte",
    origem: "open_finance",
    descricao: "x",
    valor: "100.00",
    data: "2026-11-03",
    destinacoes: [],
    ...dados,
  };
}

const PONTOS: PontoDoHistorico[] = [
  { investimento_id: "i1", data: "2026-10-10", saldo: "50.00" },
  { investimento_id: "i1", data: "2026-11-05", saldo: "160.00" },
];

describe("fluxoLiquido", () => {
  it("soma aportes e subtrai resgates dentro do período", () => {
    const movimentos = [
      movimento({ valor: "100.00" }),
      movimento({ id: "r", tipo: "resgate", valor: "30.00", data: "2026-11-04" }),
    ];
    expect(fluxoLiquido(movimentos, PONTOS, "2026-10-10", "2026-11-05")).toBe("70.00");
  });

  it("ignora o que é do dia do primeiro ponto ou fora do período", () => {
    const movimentos = [
      movimento({ data: "2026-10-10" }),
      movimento({ id: "b", data: "2026-11-06" }),
    ];
    expect(fluxoLiquido(movimentos, PONTOS, "2026-10-10", "2026-11-05")).toBe("0.00");
  });

  it("filtra pelo investimento escolhido", () => {
    const movimentos = [movimento({}), movimento({ id: "o", investimento_id: "i2", valor: "7.00" })];
    expect(fluxoLiquido(movimentos, PONTOS, "2026-10-10", "2026-11-05", "i2")).toBe("7.00");
  });

  it("saldo inicial só é entrada de dinheiro se a posição ainda não tinha saldo no começo", () => {
    const inicial = movimento({ origem: "saldo_inicial", conta_id: null, investimento_id: "i2", valor: "40.00" });
    const pontos = [...PONTOS, { investimento_id: "i2", data: "2026-11-04", saldo: "40.00" }];
    expect(fluxoLiquido([inicial], pontos, "2026-10-10", "2026-11-05")).toBe("40.00");
    const jaExistia = movimento({ origem: "saldo_inicial", conta_id: null, investimento_id: "i1", valor: "50.00" });
    expect(fluxoLiquido([jaExistia], PONTOS, "2026-10-10", "2026-11-05")).toBe("0.00");
  });
});

it("rendimento, custo e imposto não são fluxo de aporte ou resgate", () => {
  const movimentos = [
    movimento({ valor: "100.00" }),
    movimento({ tipo: "rendimento", valor: "5.00" }),
    movimento({ tipo: "custo", valor: "0.62" }),
    movimento({ tipo: "imposto", valor: "0.13" }),
  ];
  expect(fluxoLiquido(movimentos, PONTOS, "2026-10-10", "2026-11-05")).toBe("100.00");
});

describe("fluxoLiquido com a Revisão da bolsa", () => {
  const NOVA: PontoDoHistorico[] = [{ investimento_id: "i2", data: "2026-11-05", saldo: "300.00" }];

  it("saldo inicial de posição nova COM aporte ligado no período não entra no fluxo", () => {
    const movimentos = [
      movimento({ id: "s", investimento_id: "i2", origem: "saldo_inicial", conta_id: null, valor: "300.00", data: "2026-11-02" }),
      movimento({ id: "a", investimento_id: "i2", valor: "300.00", data: "2026-11-03", casamento_id: "c1" }),
    ];
    expect(fluxoLiquido(movimentos, NOVA, "2026-11-01", "2026-11-05")).toBe("300.00");
  });

  it("saldo inicial SEM aporte ligado continua entrando", () => {
    const movimentos = [
      movimento({ id: "s", investimento_id: "i2", origem: "saldo_inicial", conta_id: null, valor: "300.00", data: "2026-11-02" }),
      movimento({ id: "a", investimento_id: "i2", valor: "50.00", data: "2026-11-03", casamento_id: null }),
    ];
    expect(fluxoLiquido(movimentos, NOVA, "2026-11-01", "2026-11-05")).toBe("350.00");
  });

  it("o aporte de transação ligada entra uma vez e o aporte ligado de outra posição não afeta o saldo inicial", () => {
    const movimentos = [
      movimento({ id: "a", investimento_id: "i2", valor: "300.00", data: "2026-11-03", casamento_id: "c1" }),
      movimento({ id: "s1", investimento_id: "i1", origem: "saldo_inicial", conta_id: null, valor: "10.00", data: "2026-11-02" }),
    ];
    const pontos: PontoDoHistorico[] = [...NOVA, { investimento_id: "i1", data: "2026-11-05", saldo: "10.00" }];
    expect(fluxoLiquido(movimentos, pontos, "2026-11-01", "2026-11-05")).toBe("310.00");
  });
});
