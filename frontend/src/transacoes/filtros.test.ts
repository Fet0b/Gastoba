import { describe, expect, it } from "vitest";

import type { TransacaoDaLinha } from "./linhaDoTempo";
import type { Categoria, Conta } from "../api/tipos";
import { alternarNaLista, contarFiltros, FILTROS_VAZIOS, filtrosAtivos, passaNosFiltros } from "./filtros";

function gasto(extra: Partial<Extract<TransacaoDaLinha, { tipo: "gasto" }>> = {}): TransacaoDaLinha {
  return {
    tipo: "gasto", id: "g1", conta_id: "c1", valor: "10.00", descricao: "Cinema", data: "2026-10-10",
    categoria: "lazer", valor_coberto: "0.00", coberturas: [], tags: ["pix"], origem: "manual",
    recorrencia_id: null, ...extra,
  };
}

function ganho(extra: Partial<Extract<TransacaoDaLinha, { tipo: "ganho" }>> = {}): TransacaoDaLinha {
  return {
    tipo: "ganho", id: "n1", conta_id: "c2", valor: "20.00", descricao: "Salário", data: "2026-10-10",
    tags: ["pix"], origem: "manual", recorrencia_id: null, ...extra,
  };
}

describe("alternarNaLista", () => {
  it("acrescenta o que falta e tira o que já está, sem mudar a lista original", () => {
    const original = ["a"];
    expect(alternarNaLista(original, "b")).toEqual(["a", "b"]);
    expect(alternarNaLista(original, "a")).toEqual([]);
    expect(original).toEqual(["a"]);
  });
});

describe("contarFiltros", () => {
  it("soma os valores escolhidos nos três grupos", () => {
    expect(contarFiltros(FILTROS_VAZIOS)).toBe(0);
    expect(contarFiltros({ contas: ["c1", "c2"], categorias: ["lazer"], tags: [] })).toBe(3);
  });
});

describe("passaNosFiltros", () => {
  it("sem filtro tudo passa", () => {
    expect(passaNosFiltros(gasto(), FILTROS_VAZIOS)).toBe(true);
    expect(passaNosFiltros(ganho(), FILTROS_VAZIOS)).toBe(true);
  });

  it("conta: vale qualquer uma das escolhidas, nos gastos e nos ganhos", () => {
    const filtros = { ...FILTROS_VAZIOS, contas: ["c1", "c3"] };
    expect(passaNosFiltros(gasto(), filtros)).toBe(true);
    expect(passaNosFiltros(ganho(), filtros)).toBe(false);
  });

  it("categoria: vale qualquer uma das escolhidas e o ganho, sem categoria, fica de fora", () => {
    const filtros = { ...FILTROS_VAZIOS, categorias: ["lazer", "conforto"] };
    expect(passaNosFiltros(gasto(), filtros)).toBe(true);
    expect(passaNosFiltros(gasto({ categoria: "conhecimento" }), filtros)).toBe(false);
    expect(passaNosFiltros(ganho(), filtros)).toBe(false);
  });

  it("tag: vale qualquer uma das escolhidas, também para o ganho", () => {
    const filtros = { ...FILTROS_VAZIOS, tags: ["pix", "mercado"] };
    expect(passaNosFiltros(gasto(), filtros)).toBe(true);
    expect(passaNosFiltros(ganho({ tags: ["mercado"] }), filtros)).toBe(true);
    expect(passaNosFiltros(ganho({ tags: [] }), filtros)).toBe(false);
  });

  it("os três grupos se combinam com E", () => {
    const filtros = { contas: ["c1"], categorias: ["lazer"], tags: ["cartao"] };
    expect(passaNosFiltros(gasto({ tags: ["cartao"] }), filtros)).toBe(true);
    expect(passaNosFiltros(gasto({ tags: ["pix"] }), filtros)).toBe(false);
  });
});

describe("filtrosAtivos", () => {
  it("lista conta, categoria e tag, com o nome de cada uma", () => {
    const contas = [{ id: "c1", nome: "Nubank", rotulo: "Nubank", tipo: "corrente", final_do_numero: null }] as Conta[];
    const categorias: Categoria[] = [{ codigo: "lazer", nome: "Lazer", legada: false }];
    expect(filtrosAtivos({ contas: ["c1"], categorias: ["lazer"], tags: ["pix"] }, contas, categorias)).toEqual([
      { grupo: "contas", valor: "c1", rotulo: "Nubank, Conta corrente" },
      { grupo: "categorias", valor: "lazer", rotulo: "Lazer" },
      { grupo: "tags", valor: "pix", rotulo: "pix" },
    ]);
  });

  it("sem os nomes ainda carregados, usa um nome neutro para a conta e o código da categoria", () => {
    expect(filtrosAtivos({ contas: ["c9"], categorias: ["lazer"], tags: [] }, undefined, undefined)).toEqual([
      { grupo: "contas", valor: "c9", rotulo: "Conta" },
      { grupo: "categorias", valor: "lazer", rotulo: "lazer" },
    ]);
  });
});
