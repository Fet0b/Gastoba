import { describe, expect, it } from "vitest";

import {
  completarComORestante,
  dividirIgualmente,
  errosDasPartes,
  type LinhaDaDivisao,
  lerTags,
  motivoDaDivisao,
  partesParaEnvio,
  percentualDoValor,
  restanteDaDivisao,
  valoresDaDivisao,
  valoresEmAndamentoDaDivisao,
} from "./divisao";

const linha = (categoria: string, percentual: string, tags = ""): LinhaDaDivisao => ({
  categoria,
  percentual,
  tags,
});

describe("lerTags", () => {
  it("normaliza, tira vazias e repetidas", () => {
    expect(lerTags(" Pix, mercado ,, PIX ,  casa  nova")).toEqual(["pix", "mercado", "casa nova"]);
    expect(lerTags("")).toEqual([]);
  });
});

describe("motivoDaDivisao", () => {
  it("aceita duas partes que somam 100", () => {
    expect(motivoDaDivisao([linha("lazer", "60"), linha("conforto", "40")], true)).toBeNull();
  });

  it("recusa menos de 2 partes, mais de 10, soma errada, percentual ruim e tag ruim", () => {
    expect(motivoDaDivisao([linha("lazer", "100")], true)).toMatch(/pelo menos 2/);
    expect(motivoDaDivisao(Array.from({ length: 11 }, () => linha("lazer", "9")), true)).toMatch(/No máximo 10/);
    expect(motivoDaDivisao([linha("lazer", "60"), linha("conforto", "30")], true)).toMatch(/somar 100/);
    expect(motivoDaDivisao([linha("lazer", "0"), linha("conforto", "100")], true)).toMatch(/inteiro/);
    expect(motivoDaDivisao([linha("lazer", "50", "x".repeat(31)), linha("conforto", "50")], true)).not.toBeNull();
  });

  it("na saída exige categoria; na entrada não", () => {
    const linhas = [linha("", "50"), linha("", "50")];
    expect(motivoDaDivisao(linhas, true)).toMatch(/categoria/);
    expect(motivoDaDivisao(linhas, false)).toBeNull();
  });
});

describe("valoresDaDivisao", () => {
  it("R$ 100,01 em 33/33/34 soma exatamente, com o resto na primeira", () => {
    expect(
      valoresDaDivisao("100.01", [linha("a", "33"), linha("b", "33"), linha("c", "34")], true),
    ).toEqual(["33.01", "33.00", "34.00"]);
  });

  it("divisão inválida não calcula nada", () => {
    expect(valoresDaDivisao("10.00", [linha("a", "50")], true)).toEqual([]);
  });
});

describe("partesParaEnvio", () => {
  it("manda a categoria só na saída", () => {
    const linhas = [linha("lazer", "70", "Pix"), linha("conforto", "30")];
    expect(partesParaEnvio(linhas, true)).toEqual([
      { categoria: "lazer", tags: ["pix"], percentual: 70 },
      { categoria: "conforto", tags: [], percentual: 30 },
    ]);
    expect(partesParaEnvio(linhas, false)[0]).toEqual({ tags: ["pix"], percentual: 70 });
  });
});

describe("parte de aporte (marcador explícito)", () => {
  const aporte = (
    percentual: string,
    investimentoId = "",
    destinacoes = [{ tag: "casa", percentual: "100" }],
    tags = "",
  ): LinhaDaDivisao => ({ como_investimento:true,
    categoria: "", percentual, tags, investimentoId, destinacoes });

  it("sem investimento escolhido, a parte vale (fica para associar depois)", () => {
    expect(motivoDaDivisao([aporte("50"), linha("lazer", "50")], true)).toBeNull();
  });

  it("com investimento, as destinações precisam valer", () => {
    expect(
      motivoDaDivisao([aporte("50", "inv", [{ tag: "casa", percentual: "60" }]), linha("lazer", "50")], true),
    ).toMatch(/somar 100/);
    expect(motivoDaDivisao([aporte("50", "inv"), linha("lazer", "50")], true)).toBeNull();
  });

  it("as tags digitadas antes de virar aporte não contam nem vão para a API", () => {
    const linhas = [aporte("50", "", [], "x".repeat(31)), linha("lazer", "50")];
    expect(motivoDaDivisao(linhas, true)).toBeNull();
    expect(partesParaEnvio(linhas, true)[0]).toEqual({
      como_investimento: true,
      tags: [],
      percentual: 50,
    });
  });

  it("manda o investimento e as destinações da parte", () => {
    expect(partesParaEnvio([aporte("70", "inv", [{ tag: " Casa ", percentual: "100" }]), linha("lazer", "30")], true)[0]).toEqual({
      como_investimento: true,
      tags: [],
      percentual: 70,
      investimento_id: "inv",
      destinacoes: [{ tag: "casa", percentual: 100 }],
    });
  });
});

it("marcador explícito omite categoria de despesa e tags no aporte",()=>{
 const linhas:LinhaDaDivisao[]=[{categoria:"conforto",como_investimento:true,tags:"ignorada",percentual:"50"},{categoria:"lazer",tags:"loja",percentual:"50"}];
 expect(partesParaEnvio(linhas,true)).toEqual([{como_investimento:true,tags:[],percentual:50},{categoria:"lazer",tags:["loja"],percentual:50}]);
 expect(motivoDaDivisao([{...linhas[0],categoria:""},linhas[1]],true)).toBeNull();
});

describe("valoresEmAndamentoDaDivisao", () => {
  it("a primeira parte absorve os centavos que sobram quando a soma é 100", () => {
    const linhas = [linha("lazer", "33"), linha("conforto", "33"), linha("gasto_fixo", "34")];
    const valores = valoresEmAndamentoDaDivisao("2789.30", linhas);
    expect(valores).toEqual(["920.47", "920.47", "948.36"]);
    const total = valores.reduce((soma, v) => soma + BigInt((v as string).replace(".", "")), 0n);
    expect(total).toBe(278930n);
  });

  it("com 50/50 e valor ímpar de centavos, o centavo extra vai para a primeira parte", () => {
    expect(valoresEmAndamentoDaDivisao("0.05", [linha("a", "50"), linha("b", "50")])).toEqual(["0.03", "0.02"]);
    expect(valoresEmAndamentoDaDivisao("2789.30", [linha("a", "50"), linha("b", "50")])).toEqual([
      "1394.65",
      "1394.65",
    ]);
  });

  it("mesmo com a soma errada mostra cada parte truncada; percentual inválido é nulo", () => {
    expect(valoresEmAndamentoDaDivisao("100.00", [linha("a", "30"), linha("b", "")])).toEqual(["30.00", null]);
  });
});

describe("restanteDaDivisao", () => {
  it("diz o quanto falta, o quanto passou ou que está completa, com o valor em reais", () => {
    expect(restanteDaDivisao("2789.30", [linha("a", "50"), linha("b", "40")])).toEqual({
      situacao: "falta",
      distribuido: "2510.37",
      diferenca: "278.93",
    });
    expect(restanteDaDivisao("2789.30", [linha("a", "50"), linha("b", "50")])).toEqual({
      situacao: "completa",
      distribuido: "2789.30",
      diferenca: "0.00",
    });
    expect(restanteDaDivisao("100.00", [linha("a", "70"), linha("b", "50")])).toEqual({
      situacao: "passou",
      distribuido: "120.00",
      diferenca: "20.00",
    });
  });
});

describe("dividirIgualmente", () => {
  it("reparte 100 em inteiros, com o resto de 1 em 1 para as primeiras partes", () => {
    const ps = (n: number) =>
      dividirIgualmente(Array.from({ length: n }, () => linha("", ""))).map((l) => l.percentual);
    expect(ps(2)).toEqual(["50", "50"]);
    expect(ps(3)).toEqual(["34", "33", "33"]);
    expect(ps(7).map(Number).reduce((a, b) => a + b, 0)).toBe(100);
    expect(ps(10)).toEqual(Array(10).fill("10"));
  });

  it("volta ao modo porcentagem e preserva o resto da linha", () => {
    const [primeira] = dividirIgualmente([
      { ...linha("lazer", "", "pix"), modo: "reais", reais: "1,00" },
      linha("conforto", ""),
    ]);
    expect(primeira).toMatchObject({ categoria: "lazer", tags: "pix", percentual: "50", modo: "percentual" });
  });
});

describe("completarComORestante", () => {
  it("preenche a parte escolhida com o que falta para 100 e não mexe nas outras", () => {
    const linhas = [linha("a", "30"), linha("b", "20"), linha("c", "")];
    const novas = completarComORestante(linhas, 2);
    expect(novas.map((l) => l.percentual)).toEqual(["30", "20", "50"]);
  });

  it("substitui o valor que a própria parte já tinha", () => {
    const novas = completarComORestante([linha("a", "70"), linha("b", "10")], 1);
    expect(novas.map((l) => l.percentual)).toEqual(["70", "30"]);
  });

  it("não muda nada quando as outras já passam de 99", () => {
    const linhas = [linha("a", "100"), linha("b", "")];
    expect(completarComORestante(linhas, 1)).toBe(linhas);
  });
});

describe("percentualDoValor", () => {
  it("arredonda para o inteiro mais próximo, de 1 a 100", () => {
    expect(percentualDoValor("1000.00", "2789.30")).toBe(36);
    expect(percentualDoValor("1394.65", "2789.30")).toBe(50);
    expect(percentualDoValor("0.01", "2789.30")).toBe(1);
    expect(percentualDoValor("5000.00", "2789.30")).toBe(100);
    expect(percentualDoValor("0.00", "2789.30")).toBeNull();
  });
});

describe("errosDasPartes", () => {
  it("aponta o campo com problema em cada parte, sem texto genérico", () => {
    const erros = errosDasPartes([linha("", "50"), linha("lazer", "x", "x".repeat(31))], true);
    expect(erros[0]).toEqual({ categoria: "Escolha a categoria" });
    expect(erros[1].percentual).toBe("Informe de 1 a 100");
    expect(erros[1].tags).toBeTruthy();
  });

  it("aporte e entrada não exigem categoria", () => {
    expect(errosDasPartes([{ ...linha("", "50"), como_investimento: true }, linha("", "50")], true)[0]).toEqual({});
    expect(errosDasPartes([linha("", "50"), linha("", "50")], false)).toEqual([{}, {}]);
  });
});
