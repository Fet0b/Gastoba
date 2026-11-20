import { describe, expect, it } from "vitest";
import { HEX_DA_COR } from "../investimentos/cores";
import { atribuirCoresDasDestinacoes, corDaDestinacao } from "./mapaDeCores";

const semCor = (tag: string) => ({ tag, cor: null });

describe("corDaDestinacao", () => {
  it("mantém cor estável e prioriza escolha explícita", () => {
    expect(corDaDestinacao("viagem", null)).toBe(corDaDestinacao("viagem", null));
    expect(corDaDestinacao("viagem", "menta")).toBe("#5BD6B0");
  });

  it("usa a cor atribuída ao conjunto quando recebe o mapa", () => {
    const mapa = atribuirCoresDasDestinacoes([semCor("a"), semCor("b")]);
    expect(corDaDestinacao("a", null, mapa)).toBe(mapa.get("a"));
    expect(corDaDestinacao("a", "menta", mapa)).toBe("#5BD6B0");
  });
});

describe("atribuirCoresDasDestinacoes", () => {
  const oito = ["apartamento", "casa", "carro", "viagem", "reserva de emergência", "estudos", "saúde", "presentes"];

  it("dá oito cores distintas a oito caixinhas sem cor", () => {
    const mapa = atribuirCoresDasDestinacoes(oito.map(semCor));
    expect(new Set(oito.map((t) => mapa.get(t))).size).toBe(8);
    for (const cor of mapa.values()) expect(Object.values(HEX_DA_COR)).toContain(cor);
  });

  it("a nona repete uma cor da paleta", () => {
    const nove = [...oito, "zzz"];
    const mapa = atribuirCoresDasDestinacoes(nove.map(semCor));
    expect(mapa.size).toBe(9);
    expect(new Set(nove.map((t) => mapa.get(t))).size).toBe(8);
  });

  it("a cor escolhida nunca é tomada por uma automática", () => {
    const entrada = [{ tag: "casa", cor: "menta" as const }, ...oito.filter((t) => t !== "casa").slice(0, 6).map(semCor)];
    const mapa = atribuirCoresDasDestinacoes(entrada);
    expect(mapa.get("casa")).toBe(HEX_DA_COR.menta);
    const outras = entrada.filter((e) => e.tag !== "casa").map((e) => mapa.get(e.tag));
    expect(outras).not.toContain(HEX_DA_COR.menta);
    expect(new Set(outras).size).toBe(outras.length);
  });

  it("é determinística e não depende da ordem de entrada", () => {
    const a = atribuirCoresDasDestinacoes(oito.map(semCor));
    const b = atribuirCoresDasDestinacoes([...oito].reverse().map(semCor));
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });

  it("ignora tag nula e repetida", () => {
    const mapa = atribuirCoresDasDestinacoes([semCor("a"), { tag: null, cor: null }, semCor("a")] as never);
    expect(mapa.size).toBe(1);
  });
});
