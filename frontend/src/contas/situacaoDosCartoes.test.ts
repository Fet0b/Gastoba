import { describe, expect, it } from "vitest";

import type { CartaoComFaturas, Fatura } from "../api/tipos";
import { situacaoDosCartoes } from "./situacaoDosCartoes";

function fatura(situacao: Fatura["situacao"]): Fatura {
  return {
    id: situacao,
    inicio: null,
    fechamento: "2026-11-15",
    vencimento: null,
    total: "10.00",
    pago: "0.00",
    restante: "10.00",
    a_favor: "0.00",
    minimo: null,
    situacao,
    fonte: "banco",
    quantidade_de_compras: 0,
  };
}

function cartao(id: string, ...situacoes: Fatura["situacao"][]): CartaoComFaturas {
  return { conta_id: id, conta_nome: id, valor_devido: "10.00", faturas: situacoes.map(fatura) };
}

describe("situacaoDosCartoes", () => {
  it("pega a situação da mais recente e se alguma fatura venceu", () => {
    const mapa = situacaoDosCartoes([cartao("a", "aberta", "vencida", "paga"), cartao("b", "fechada")]);

    expect(mapa.get("a")).toEqual({ recente: "aberta", temVencida: true });
    expect(mapa.get("b")).toEqual({ recente: "fechada", temVencida: false });
  });

  it("cartão sem faturas fica sem situação", () => {
    expect(situacaoDosCartoes([cartao("c")]).get("c")).toEqual({ recente: null, temVencida: false });
  });
});
