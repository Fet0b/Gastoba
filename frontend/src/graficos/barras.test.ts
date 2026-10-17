import { describe, expect, it } from "vitest";

import type { Gasto, ResumoPorTags } from "../api/tipos";
import { deCentavos, paraCentavos } from "../dinheiro/dinheiro";
import {
  barraPelaChave,
  CHAVE_DE_OUTRAS,
  CHAVE_SEM_TAG, FRACAO_MINIMA_DA_BARRA,
  prepararBarras,
} from "./barras";

function resumo(...pares: [string | null, string][]): ResumoPorTags {
  const centavos = pares.reduce((t, [, v]) => t + paraCentavos(v), 0n);
  return {
    inicio: "2026-06-01",
    fim: "2026-06-30",
    total: deCentavos(centavos),
    fatias: pares.map(([tag, valor]) => ({ tag, valor })),
  };
}

describe("prepararBarras", () => {
  it("ordena por valor, da maior para a menor", () => {
    const barras = prepararBarras(resumo(["a", "10.00"], ["b", "30.00"], ["c", "20.00"]));
    expect(barras.map((b) => b.rotulo)).toEqual(["b", "c", "a"]);
  });

  it("calcula a fração sobre a maior barra e o percentual sobre o total", () => {
    const barras = prepararBarras(resumo(["a", "30.00"], ["b", "15.00"]));
    expect(barras[0]).toMatchObject({ fracaoDaMaior: 1, percentual: "67%" });
    expect(barras[0].fracaoDoTotal).toBeCloseTo(30 / 45, 5);
    expect(barras[1]).toMatchObject({ fracaoDaMaior: 0.5, percentual: "33%" });
  });

  it("limita a 8 tags, soma o resto em 'Outras (N tags)' e põe 'Sem tag' por último", () => {
    const doze = Array.from({ length: 12 }, (_, i): [string, string] => [`t${i}`, `${12 - i}.00`]);
    const barras = prepararBarras(resumo(...doze, [null, "100.00"]));
    expect(barras.map((b) => b.tipo)).toEqual([
      ...Array(8).fill("tag"),
      "outras",
      "sem_tag",
    ]);
    const outras = barras[8];
    expect(outras.rotulo).toBe("Outras (4 tags)");
    expect(outras.valor).toBe("10.00"); // 4+3+2+1
    expect(barras[9].rotulo).toBe("Sem tag");
  });

  it("com uma tag a mais que o máximo mostra a tag, não 'Outras (1 tag)'", () => {
    const nove = Array.from({ length: 9 }, (_, i): [string, string] => [`t${i}`, `${9 - i}.00`]);
    const barras = prepararBarras(resumo(...nove));
    expect(barras).toHaveLength(9);
    expect(barras.every((b) => b.tipo === "tag")).toBe(true);
  });

  it("respeita o máximo de tags recebido", () => {
    const barras = prepararBarras(resumo(["a", "5.00"], ["b", "4.00"], ["c", "3.00"], ["d", "2.00"]), 1);
    expect(barras.map((b) => b.rotulo)).toEqual(["a", "Outras (3 tags)"]);
  });

  it("'Sem tag' fica por último mesmo sendo a maior", () => {
    const barras = prepararBarras(resumo([null, "100.00"], ["a", "10.00"]));
    expect(barras.map((b) => b.rotulo)).toEqual(["a", "Sem tag"]);
    expect(barras[1].fracaoDaMaior).toBe(1);
  });

  it("a barra de menos de 1% da maior ganha o piso", () => {
    const barras = prepararBarras(resumo(["a", "1000.00"], ["b", "1.00"]));
    expect(barras[1].fracaoDaMaior).toBe(FRACAO_MINIMA_DA_BARRA);
    expect(barras[1].percentual).toBe("<1%");
  });

  it("valores empatados têm a mesma fração e mantêm a ordem recebida", () => {
    const barras = prepararBarras(resumo(["b", "10.00"], ["a", "10.00"]));
    expect(barras.map((b) => b.rotulo)).toEqual(["b", "a"]);
    expect(barras[0].fracaoDaMaior).toBe(barras[1].fracaoDaMaior);
  });

  it("uma só barra tem fração 1", () => {
    expect(prepararBarras(resumo(["a", "5.00"]))[0].fracaoDaMaior).toBe(1);
    expect(prepararBarras(resumo([null, "5.00"]))[0]).toMatchObject({ fracaoDaMaior: 1, percentual: "100%" });
  });

  it("lista vazia ou total zero dão lista vazia", () => {
    expect(prepararBarras(resumo())).toEqual([]);
    expect(prepararBarras({ ...resumo(["a", "0.00"]), total: "0.00" })).toEqual([]);
  });

  it("não perde precisão com valores enormes", () => {
    const barras = prepararBarras(
      resumo(["a", "999999999999.99"]) as ResumoPorTags,
    );
    expect(barras[0].valor).toBe("999999999999.99");
  });
});

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

describe("prepararBarras: quantidade, chave e membros", () => {
  it("sem a lista de gastos, não há quantidade", () => {
    const barras = prepararBarras(resumo(["a", "10.00"]));
    expect(barras[0].quantidade).toBeUndefined();
  });

  it("conta os gastos de cada tag, de 'Sem tag' e de 'Outras'", () => {
    const sete = Array.from({ length: 4 }, (_, i): [string, string] => [`t${i}`, `${4 - i}.00`]);
    const barras = prepararBarras(resumo(...sete, [null, "9.00"]), 2, [
      gasto("1", "3.00", ["t0", "t1"]),
      gasto("2", "1.00", ["t0"]),
      gasto("3", "2.00", ["t2", "t3"]),
      gasto("4", "1.00", ["t3"]),
      gasto("5", "9.00", []),
    ]);
    expect(barras.map((b) => [b.rotulo, b.quantidade])).toEqual([
      ["t0", 2],
      ["t1", 1],
      ["Outras (2 tags)", 2],
      ["Sem tag", 1],
    ]);
  });

  it("dá a cada barra uma chave: a tag, uma marca para 'Sem tag' e 'outras'", () => {
    const barras = prepararBarras(resumo(["a", "5.00"], ["b", "4.00"], ["c", "3.00"], [null, "1.00"]), 1);
    expect(barras.map((b) => b.chave)).toEqual(["a", CHAVE_DE_OUTRAS, CHAVE_SEM_TAG]);
  });

  it("uma tag chamada 'outras' não colide com a barra 'Outras'", () => {
    const barras = prepararBarras(resumo(["outras", "9.00"], ["b", "5.00"], ["c", "4.00"], ["d", "3.00"]), 1);
    const chaves = barras.map((b) => b.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(barraPelaChave(barras, "outras")?.tipo).toBe("tag");
    expect(barraPelaChave(barras, CHAVE_DE_OUTRAS)?.tipo).toBe("outras");
  });

  it("'Outras' traz as tags agrupadas com o valor, o percentual e a quantidade de cada uma", () => {
    const barras = prepararBarras(
      resumo(["a", "50.00"], ["b", "30.00"], ["c", "15.00"], ["d", "5.00"]),
      1,
      [gasto("1", "30.00", ["b"]), gasto("2", "15.00", ["c"]), gasto("3", "5.00", ["d"])],
    );
    const outras = barras[1];
    expect(outras.membros?.map((m) => [m.tag, m.valor, m.percentual, m.quantidade])).toEqual([
      ["b", "30.00", "30%", 1],
      ["c", "15.00", "15%", 1],
      ["d", "5.00", "5%", 1],
    ]);
    expect(barras[0].membros).toBeUndefined();
  });

  it("não altera o agrupamento de fatias.ts: a soma de 'Outras' é a das tags agrupadas", () => {
    const barras = prepararBarras(resumo(["a", "5.00"], ["b", "4.00"], ["c", "3.00"], ["d", "2.00"]), 1);
    expect(barras[1].valor).toBe("9.00");
    expect(barras[1].membros).toHaveLength(3);
  });
});

describe("barraPelaChave", () => {
  it("acha uma barra, 'Sem tag' e uma tag que está dentro de 'Outras'", () => {
    const barras = prepararBarras(resumo(["a", "5.00"], ["b", "4.00"], ["c", "3.00"], [null, "1.00"]), 1);
    expect(barraPelaChave(barras, "a")).toMatchObject({ tipo: "tag", rotulo: "a", valor: "5.00" });
    expect(barraPelaChave(barras, CHAVE_SEM_TAG)).toMatchObject({ tipo: "sem_tag" });
    expect(barraPelaChave(barras, "c")).toMatchObject({ tipo: "tag", rotulo: "c", valor: "3.00", percentual: "23%" });
  });

  it("não acha o que não existe", () => {
    const barras = prepararBarras(resumo(["a", "5.00"]));
    expect(barraPelaChave(barras, "zzz")).toBeUndefined();
    expect(barraPelaChave(barras, null)).toBeUndefined();
  });
});
