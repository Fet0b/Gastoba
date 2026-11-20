import { describe, expect, it } from "vitest";

import { deCaminho, paraCaminho } from "./rota";

describe("paraCaminho", () => {
  it("dá a cada tela o seu caminho, com Outros como /recorrencias", () => {
    expect(paraCaminho("inicio")).toBe("/inicio");
    expect(paraCaminho("transacoes")).toBe("/transacoes");
    expect(paraCaminho("orcamento")).toBe("/orcamento");
    expect(paraCaminho("contas")).toBe("/contas");
    expect(paraCaminho("investimentos")).toBe("/investimentos");
    expect(paraCaminho("caixinhas")).toBe("/caixinhas");
    expect(paraCaminho("faturas")).toBe("/faturas");
    expect(paraCaminho("tags")).toBe("/tags");
    expect(paraCaminho("outros")).toBe("/recorrencias");
    expect(paraCaminho("perfil")).toBe("/perfil");
  });

  it("leva o mês só nas telas mensais", () => {
    const mes = { ano: 2026, mes: 10 };
    expect(paraCaminho("orcamento", { mes })).toBe("/orcamento?mes=2026-10");
    expect(paraCaminho("tags", { mes })).toBe("/tags?mes=2026-10");
    expect(paraCaminho("inicio", { mes })).toBe("/inicio?mes=2026-10");
    expect(paraCaminho("contas", { mes })).toBe("/contas");
  });

  it("leva a vista e a data só em Transações, e a data define o mês", () => {
    expect(paraCaminho("transacoes", { vistaDeTransacoes: "aportes" })).toBe("/transacoes?vista=aportes");
    expect(paraCaminho("transacoes", { dataDoMovimento: "2026-09-15" })).toBe(
      "/transacoes?mes=2026-09&data=2026-09-15",
    );
    expect(paraCaminho("orcamento", { vistaDeTransacoes: "aportes", dataDoMovimento: "2026-09-15" })).toBe(
      "/orcamento",
    );
  });
});

describe("deCaminho", () => {
  it("/caixinhas é uma tela própria, não mensal: o mês à toa a reescreve", () => {
    expect(deCaminho("/caixinhas", "")).toEqual({ tela: "caixinhas", canonico: true });
    expect(deCaminho("/caixinhas/", "")).toMatchObject({ tela: "caixinhas", canonico: false });
    expect(deCaminho("/caixinhas", "?mes=2026-10")).toEqual({ tela: "caixinhas", canonico: false });
  });

  it("lê a tela, o mês, a vista e a data", () => {
    expect(deCaminho("/orcamento", "?mes=2026-10")).toEqual({
      tela: "orcamento",
      mes: { ano: 2026, mes: 10 },
      canonico: true,
    });
    expect(deCaminho("/transacoes", "?mes=2026-09&data=2026-09-15&vista=aportes")).toEqual({
      tela: "transacoes",
      mes: { ano: 2026, mes: 9 },
      dataDoMovimento: "2026-09-15",
      vistaDeTransacoes: "aportes",
      canonico: true,
    });
    expect(deCaminho("/recorrencias", "").tela).toBe("outros");
  });

  it("cai no Início, fora do canônico, com caminho desconhecido, raiz ou barra final", () => {
    expect(deCaminho("/", "")).toEqual({ tela: "inicio", canonico: false });
    expect(deCaminho("/nada", "?mes=2026-10")).toEqual({
      tela: "inicio",
      mes: { ano: 2026, mes: 10 },
      canonico: false,
    });
    expect(deCaminho("/contas/", "")).toEqual({ tela: "contas", canonico: false });
  });

  it("ignora mês, data e vista inválidos", () => {
    expect(deCaminho("/orcamento", "?mes=2026-13").mes).toBeUndefined();
    expect(deCaminho("/orcamento", "?mes=2026-1").mes).toBeUndefined();
    expect(deCaminho("/orcamento", "?mes=abc").mes).toBeUndefined();
    expect(deCaminho("/orcamento", "?mes=0000-05").mes).toBeUndefined();
    expect(deCaminho("/transacoes", "?data=2026-02-31").dataDoMovimento).toBeUndefined();
    expect(deCaminho("/transacoes", "?vista=caixa").vistaDeTransacoes).toBeUndefined();
  });

  it("ignora o mês numa tela que não é mensal", () => {
    expect(deCaminho("/contas", "?mes=2026-10")).toEqual({ tela: "contas", canonico: false });
  });

  it("é o inverso de paraCaminho", () => {
    const caminho = paraCaminho("transacoes", { dataDoMovimento: "2026-09-15", vistaDeTransacoes: "aportes" });
    const [pathname, search] = caminho.split("?");
    expect(paraCaminho("transacoes", deCaminho(pathname, `?${search}`))).toBe(caminho);
  });
});
