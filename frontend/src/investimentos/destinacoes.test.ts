import { describe, expect, it } from "vitest";

import type { Investimento } from "../api/tipos";
import { somar } from "../dinheiro/dinheiro";
import { HEX_DA_COR } from "./cores";
import {
  caixinhaUnica,
  coresDasLinhas,
  redistribuirPercentuais,
  restanteDaDistribuicao,
  destinacoesParaEnvio,
  dividirPorPercentuais,
  lerPercentual,
  motivoDasDestinacoes,
  rotuloDaRentabilidade,
  valoresEmAndamento,
  MENSAGEM_SOMA_DAS_DESTINACOES,
  somaDosPercentuais,
} from "./destinacoes";

const linha = (tag: string, percentual: string) => ({ tag, percentual });

describe("lerPercentual", () => {
  it.each([
    ["1", 1],
    [" 50 ", 50],
    ["100", 100],
  ])("%j vira %i", (texto, esperado) => expect(lerPercentual(texto)).toBe(esperado));

  it.each(["", "0", "101", "-5", "1.5", "1e1", "abc"])("%j não vale", (texto) =>
    expect(lerPercentual(texto)).toBeNull(),
  );
});

describe("motivoDasDestinacoes", () => {
  it("aceita linhas certas", () => {
    expect(motivoDasDestinacoes([linha("Casa", "60"), linha("viagem", "40")])).toBeNull();
    expect(somaDosPercentuais([linha("a", "60"), linha("b", "x")])).toBe(60);
  });

  it("recusa lista vazia, tag repetida (depois de normalizar), tag inválida e percentual ruim", () => {
    expect(motivoDasDestinacoes([])).not.toBeNull();
    expect(motivoDasDestinacoes([linha("Casa", "50"), linha(" casa ", "50")])).toMatch(/uma vez/);
    expect(motivoDasDestinacoes([linha("", "100")])).not.toBeNull();
    expect(motivoDasDestinacoes([linha("a", "0"), linha("b", "100")])).toMatch(/inteiro/);
  });

  it("recusa soma diferente de 100", () => {
    expect(motivoDasDestinacoes([linha("a", "50"), linha("b", "40")])).toBe(
      MENSAGEM_SOMA_DAS_DESTINACOES,
    );
  });
});

describe("dividirPorPercentuais", () => {
  it("R$ 100,01 em 33/33/34 soma exatamente R$ 100,01, com o resto na primeira", () => {
    const partes = dividirPorPercentuais("100.01", [
      linha("a", "33"),
      linha("b", "33"),
      linha("c", "34"),
    ]);
    expect(partes).toEqual(["33.01", "33.00", "34.00"]);
  });

  it("um centavo em 50/50 vai todo para a primeira", () => {
    expect(dividirPorPercentuais("0.01", [linha("a", "50"), linha("b", "50")])).toEqual([
      "0.01",
      "0.00",
    ]);
  });

  it("linhas inválidas não dividem nada", () => {
    expect(dividirPorPercentuais("10.00", [linha("a", "50")])).toEqual([]);
  });
});

describe("destinacoesParaEnvio", () => {
  it("normaliza a tag e converte o percentual", () => {
    expect(destinacoesParaEnvio([linha("  Casa  Nova ", "100")])).toEqual([
      { tag: "casa nova", percentual: 100 },
    ]);
  });
});

describe("rotuloDaRentabilidade", () => {
  it.each([
    ["4.32", "+4,32%"],
    ["-3.33", "\u{2212}3,33%"],
    ["0.00", "0,00%"],
    ["100.00", "+100,00%"],
    [null, "\u{2013}"],
  ])("%j vira %j", (texto, esperado) => expect(rotuloDaRentabilidade(texto)).toBe(esperado));
});

describe("valoresEmAndamento", () => {
  it("mostra o valor de cada linha com percentual válido, mesmo sem somar 100", () => {
    expect(valoresEmAndamento("2788.75", [linha("a", "40"), linha("b", "")])).toEqual([
      "1115.50",
      null,
    ]);
  });

  it("com a soma completa usa a divisão exata, com o resto na primeira", () => {
    expect(
      valoresEmAndamento("100.01", [linha("a", "33"), linha("b", "33"), linha("c", "34")]),
    ).toEqual(["33.01", "33.00", "34.00"]);
  });
});

describe("valoresEmAndamento (exatidão com soma 100)", () => {
  it("divide exato mesmo com tag vazia", () => {
    expect(
      valoresEmAndamento("100.01", [linha("", "33"), linha("b", "33"), linha("c", "34")]),
    ).toEqual(["33.01", "33.00", "34.00"]);
  });

  it("R$ 0,01 não gera negativo e a soma é exata", () => {
    expect(
      valoresEmAndamento("0.01", [linha("a", "33"), linha("b", "33"), linha("c", "34")]),
    ).toEqual(["0.01", "0.00", "0.00"]);
  });

  it.each([
    ["2788.75", [50, 50]],
    ["1.00", [1, 99]],
    ["0.03", [33, 33, 34]],
  ])("a soma das partes de %s com 100%% é o total", (total, percentuais) => {
    const saida = valoresEmAndamento(
      total,
      percentuais.map((p, i) => linha(`t${i}`, String(p))),
    ) as string[];
    expect(somar(saida)).toBe(total);
  });
});

describe("restanteDaDistribuicao", () => {
  it("falta", () => {
    expect(restanteDaDistribuicao("2788.75", [linha("a", "40"), linha("b", "")])).toEqual({
      situacao: "falta",
      percentual: 60,
      valor: "1673.25",
    });
  });
  it("trunca o valor", () => {
    expect(restanteDaDistribuicao("2788.75", [linha("a", "70")])).toEqual({
      situacao: "falta",
      percentual: 30,
      valor: "836.62",
    });
  });
  it("excede", () => {
    expect(restanteDaDistribuicao("2788.75", [linha("a", "60"), linha("b", "50")])).toEqual({
      situacao: "excede",
      percentual: 10,
      valor: "278.87",
    });
  });
  it("completa mesmo com tag inválida", () => {
    expect(restanteDaDistribuicao("100.01", [linha("", "50"), linha("b", "50")])).toEqual({
      situacao: "completa",
      percentual: 0,
      valor: "0.00",
    });
  });
  it("sem valor, valor nulo", () => {
    expect(restanteDaDistribuicao(undefined, [linha("a", "40")])).toEqual({
      situacao: "falta",
      percentual: 60,
      valor: null,
    });
  });
  it("percentual inválido conta zero", () => {
    expect(restanteDaDistribuicao("10.00", [linha("a", "abc")])).toEqual({
      situacao: "falta",
      percentual: 100,
      valor: "10.00",
    });
  });
});

describe("redistribuirPercentuais", () => {
  const pcts = (linhas: { percentual: string }[]) => linhas.map((l) => l.percentual);
  const L = (...ps: string[]) => ps.map((p, i) => linha(`t${i}`, p));

  it.each([
    [L("60", "40"), 0, 70, ["70", "30"]],
    [L("50", "30", "20"), 0, 60, ["60", "24", "16"]],
    [L("34", "33", "33"), 0, 100, ["98", "1", "1"]],
    [L("50", "50"), 1, 0, ["99", "1"]],
    [L("100", ""), 1, 20, ["80", "20"]],
    [L("", "", ""), 0, 40, ["40", "30", "30"]],
    [L("", "", "", ""), 0, 1, ["1", "33", "33", "33"]],
    [L("", "", ""), 0, 1, ["1", "50", "49"]],
    [L("50"), 0, 150, ["100"]],
  ])("caso %#", (linhas, posicao, novo, esperado) => {
    expect(pcts(redistribuirPercentuais(linhas, posicao, novo))).toEqual(esperado);
  });

  it("preserva tags e não muta a entrada", () => {
    const entrada = [linha("casa", "60"), linha("viagem", "40")];
    const copia = structuredClone(entrada);
    const saida = redistribuirPercentuais(entrada, 0, 70);
    expect(entrada).toEqual(copia);
    expect(saida.map((l) => l.tag)).toEqual(["casa", "viagem"]);
  });

  it("sempre inteiros de 1 a 100 somando 100", () => {
    for (let n = 2; n <= 5; n += 1) {
      const base = [10, 20, 30, 30, 10].slice(0, n).map(String);
      for (let novo = 0; novo <= 101; novo += 1) {
        for (let pos = 0; pos < n; pos += 1) {
          const saida = redistribuirPercentuais(L(...base), pos, novo).map((l) => Number(l.percentual));
          expect(saida.every((p) => Number.isInteger(p) && p >= 1 && p <= 100)).toBe(true);
          expect(saida.reduce((a, b) => a + b, 0)).toBe(100);
        }
      }
    }
  });
});

describe("coresDasLinhas", () => {
  const posicao = (tag: string | null, cor: "menta" | null) =>
    ({ destinacoes: [{ tag, cor }] }) as unknown as Investimento;

  it("mantém a cor de uma tag quando a ordem das linhas muda",()=>{
    const cores=coresDasLinhas([linha("casa","50"),linha("viagem","50")],undefined);
    expect(coresDasLinhas([linha("viagem","50"),linha(" Casa ","50")],undefined)).toEqual([cores[1],cores[0]]);
    expect(cores.every(c=>Object.values(HEX_DA_COR).includes(c))).toBe(true);
  });
  it("a cor salva vence a automática e não muda a cor da outra tag",()=>{
    const semCor=coresDasLinhas([linha("viagem","100")],undefined)[0];
    expect(coresDasLinhas([linha("Casa ","50"),linha("viagem","50")],[posicao("casa","menta")])).toEqual([HEX_DA_COR.menta,semCor]);
  });
  it("cor nula usa a mesma automática de uma tag sem cadastro de cor",()=>{
    expect(coresDasLinhas([linha("casa","100")],[posicao("casa",null)])).toEqual(coresDasLinhas([linha("casa","100")],undefined));
  });
});

describe("caixinhaUnica", () => {
  const posicao = (destinacoes: { tag: string | null; principal: string }[]) => ({ destinacoes: destinacoes.map((d) => ({ ...d, valor_atual: d.principal })) }) as unknown as Investimento;
  it("devolve a tag só quando há exatamente uma caixinha com principal", () => {
    expect(caixinhaUnica(posicao([{ tag: "viagem", principal: "10.00" }]))).toBe("viagem");
    expect(caixinhaUnica(posicao([{ tag: "viagem", principal: "10.00" }, { tag: null, principal: "5.00" }]))).toBe("viagem");
    expect(caixinhaUnica(posicao([{ tag: "viagem", principal: "10.00" }, { tag: "casa", principal: "1.00" }]))).toBeNull();
    expect(caixinhaUnica(posicao([{ tag: "viagem", principal: "0.00" }]))).toBeNull();
    expect(caixinhaUnica(posicao([]))).toBeNull();
  });
});
