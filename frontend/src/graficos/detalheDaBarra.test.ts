import { describe, expect, it } from "vitest";

import type { Gasto } from "../api/tipos";
import { paraCentavos } from "../dinheiro/dinheiro";
import { gastosDaBarra } from "./detalheDaBarra";

function gasto(id: string, valor: string, tags: string[], data = "2026-06-10"): Gasto {
  return {
    id,
    conta_id: "c1",
    valor,
    descricao: `Gasto ${id}`,
    data,
    categoria: "lazer",
    tags,
    origem: "manual",
    recorrencia_id: null,
  };
}

const GASTOS = [
  gasto("1", "10.00", ["mercado"], "2026-06-02"),
  gasto("2", "10.01", ["mercado", "pix", "casa"], "2026-06-20"),
  gasto("3", "7.00", [], "2026-06-11"),
  gasto("4", "5.00", ["pix"], "2026-06-11"),
];

describe("gastosDaBarra", () => {
  it("devolve os gastos que têm a tag, do mais recente ao mais antigo", () => {
    const itens = gastosDaBarra({ tipo: "tag", rotulo: "mercado" }, GASTOS);
    expect(itens.map((i) => i.gasto.id)).toEqual(["2", "1"]);
  });

  it("normaliza a tag procurada", () => {
    const itens = gastosDaBarra({ tipo: "tag", rotulo: "  Mercado " }, GASTOS);
    expect(itens).toHaveLength(2);
  });

  it("divide o gasto entre as tags em partes iguais, com o resto nas primeiras (BigInt)", () => {
    // 10.01 = 1001 centavos em 3 tags: 334, 334, 333.
    const partes = (tag: string) =>
      gastosDaBarra({ tipo: "tag", rotulo: tag }, GASTOS).find((i) => i.gasto.id === "2")?.parte;
    expect(partes("mercado")).toBe("3.34");
    expect(partes("pix")).toBe("3.34");
    expect(partes("casa")).toBe("3.33");
  });

  it("o gasto com várias tags aparece em cada uma das suas barras, com o valor inteiro", () => {
    const itens = gastosDaBarra({ tipo: "tag", rotulo: "pix" }, GASTOS);
    expect(itens.map((i) => [i.gasto.id, i.gasto.valor])).toEqual([
      ["2", "10.01"],
      ["4", "5.00"],
    ]);
  });

  it("'Sem tag' devolve os gastos sem tag, com a parte igual ao valor", () => {
    const itens = gastosDaBarra({ tipo: "sem_tag", rotulo: "Sem tag" }, GASTOS);
    expect(itens.map((i) => [i.gasto.id, i.parte])).toEqual([["3", "7.00"]]);
  });

  it("'Outras' devolve os gastos de qualquer tag agrupada, somando a parte delas", () => {
    const itens = gastosDaBarra(
      { tipo: "outras", rotulo: "Outras (2 tags)", membros: [{ tag: "pix" }, { tag: "casa" }] },
      GASTOS,
    );
    expect(itens.map((i) => [i.gasto.id, i.parte])).toEqual([
      ["2", "6.67"], // 3.34 + 3.33
      ["4", "5.00"],
    ]);
  });

  it("sem gastos, devolve vazio", () => {
    expect(gastosDaBarra({ tipo: "tag", rotulo: "x" }, [])).toEqual([]);
  });
});

describe("gastosDaBarra: as partes fecham a conta", () => {
  const formas: string[][][] = [
    [["10.01", "a", "b", "c"], ["0.01", "a", "b"], ["7.00"], ["5.00", "c"]],
    [["0.05", "x", "y", "z", "w"], ["99.99", "x", "y", "z"], ["1.00", "w", "w"]],
    [["3.33", "a", "b"], ["3.33", "b", "a"], ["0.02", "a", "b", "c"]],
  ];

  it("a soma das partes de todas as barras é o total dos gastos e cada gasto soma o seu valor", () => {
    for (const forma of formas) {
      const gastos = forma.map(([valor, ...tags], i) => ({
        ...GASTOS[0],
        id: String(i),
        valor,
        tags: [...new Set(tags)],
      }));
      const tags = [...new Set(gastos.flatMap((g) => g.tags))];
      const alvos = [
        ...tags.map((tag) => ({ tipo: "tag" as const, rotulo: tag })),
        { tipo: "sem_tag" as const, rotulo: "Sem tag" },
      ];
      const soma = (lista: { parte: string }[]) =>
        lista.reduce((t, i) => t + paraCentavos(i.parte), 0n);
      const todas = alvos.map((alvo) => gastosDaBarra(alvo, gastos));
      expect(todas.reduce((t, lista) => t + soma(lista), 0n)).toBe(
        gastos.reduce((t, g) => t + paraCentavos(g.valor), 0n),
      );
      // "Outras" com todas as tags soma o valor de cada gasto uma vez só.
      const outras = gastosDaBarra(
        { tipo: "outras", rotulo: "Outras", membros: tags.map((tag) => ({ tag })) },
        gastos,
      );
      expect(outras).toHaveLength(gastos.filter((g) => g.tags.length > 0).length);
      for (const item of outras) expect(item.parte).toBe(item.gasto.valor);
    }
  });
});
