import { describe, expect, it } from "vitest";

import {
  LIMITE_CENTAVOS,
  deCentavos,
  deMascara,
  formatar,
  interpolar,
  interpretarDigitacao,
  paraCentavos,
  percentualDe,
  somar,
} from "./dinheiro";

const NBSP = "\u{a0}";
const MENOS = "−";

describe("paraCentavos", () => {
  it.each([
    ["25.90", 2590n],
    ["-10.00", -1000n],
    ["974.1", 97410n],
    ["1.500", 150n],
    ["0", 0n],
    ["7", 700n],
    ["1000000000000.00", 10n ** 14n],
  ])("converte %s em %s centavos", (texto, centavos) => {
    expect(paraCentavos(texto)).toBe(centavos);
  });

  it.each(["", "abc", "1,5", "1.555", "1.", ".5", "--1", "1e3", " 1.00", "R$ 1,00"])(
    "recusa %j",
    (texto) => {
      expect(() => paraCentavos(texto)).toThrow(Error);
    },
  );
});

describe("deCentavos", () => {
  it.each([
    [2590n, "25.90"],
    [0n, "0.00"],
    [5n, "0.05"],
    [-1000n, "-10.00"],
    [-50n, "-0.50"],
    [10n ** 14n, "1000000000000.00"],
  ])("converte %s centavos em %s", (centavos, texto) => {
    expect(deCentavos(centavos)).toBe(texto);
  });
});

describe("formatar", () => {
  it("completa os centavos", () => {
    expect(formatar("974.1")).toBe(`R$${NBSP}974,10`);
  });

  it("usa o sinal de menos tipográfico antes do R$", () => {
    expect(formatar("-0.50")).toBe(`${MENOS}R$${NBSP}0,50`);
    expect(formatar("-10.00")).toBe(`${MENOS}R$${NBSP}10,00`);
  });

  it("separa os milhares com ponto", () => {
    expect(formatar("1234.56")).toBe(`R$${NBSP}1.234,56`);
  });

  it("formata zero sem sinal", () => {
    expect(formatar("0.00")).toBe(`R$${NBSP}0,00`);
    expect(formatar("-0.00")).toBe(`R$${NBSP}0,00`);
  });

  it("formata o valor no limite sem perder precisão", () => {
    expect(formatar("1000000000000.00")).toBe(`R$${NBSP}1.000.000.000.000,00`);
    expect(formatar("999999999999.99")).toBe(`R$${NBSP}999.999.999.999,99`);
  });
});

describe("somar", () => {
  it("soma exatamente, sem float", () => {
    expect(somar(["0.10", "0.10", "0.10"])).toBe("0.30");
  });

  it("devolve zero para a lista vazia", () => {
    expect(somar([])).toBe("0.00");
  });

  it("soma além do limite de um valor isolado, sem perder precisão", () => {
    // O limite vale por valor (máscara e backend), não para totais.
    expect(somar(["1000000000000.00", "0.01"])).toBe("1000000000000.01");
    expect(formatar("1000000000000.01")).toBe(`R$${NBSP}1.000.000.000.000,01`);
  });

  it("soma valores negativos", () => {
    expect(somar(["10.00", "-25.90"])).toBe("-15.90");
  });
});

describe("interpolar", () => {
  it("devolve o início em t = 0", () => {
    expect(interpolar("100.00", "200.00", 0)).toBe("100.00");
  });

  it("devolve o fim em t = 1", () => {
    expect(interpolar("100.00", "200.00", 1)).toBe("200.00");
  });

  it("calcula o meio do caminho", () => {
    expect(interpolar("100.00", "200.00", 0.5)).toBe("150.00");
  });

  it("interpola para baixo e cruzando o zero", () => {
    expect(interpolar("10.00", "-10.00", 0.5)).toBe("0.00");
    expect(interpolar("974.10", "948.20", 1)).toBe("948.20");
  });

  it("limita t ao intervalo [0, 1] e trata NaN como o fim", () => {
    expect(interpolar("100.00", "200.00", -0.5)).toBe("100.00");
    expect(interpolar("100.00", "200.00", 1.5)).toBe("200.00");
    expect(interpolar("100.00", "200.00", Number.NaN)).toBe("200.00");
  });

  it("mantém a precisão no limite", () => {
    expect(interpolar("0.00", "1000000000000.00", 1)).toBe("1000000000000.00");
  });
});

describe("interpretarDigitacao (máscara)", () => {
  it.each([
    ["0", "0,00"],
    ["5", "0,05"],
    ["2590", "25,90"],
    ["", "0,00"],
    ["000025", "0,25"],
    ["123456", "1.234,56"],
  ])("%j vira %j", (digitos, mascara) => {
    expect(interpretarDigitacao(digitos)).toBe(mascara);
  });

  it("ignora o que não é dígito ao colar", () => {
    expect(interpretarDigitacao("R$ 25,90")).toBe("25,90");
  });

  it("aceita o próprio texto da máscara mais um dígito", () => {
    expect(interpretarDigitacao("25,901")).toBe("259,01");
    expect(interpretarDigitacao("1.234,567")).toBe("12.345,67");
  });

  it("aceita exatamente o limite", () => {
    expect(interpretarDigitacao(LIMITE_CENTAVOS.toString())).toBe("1.000.000.000.000,00");
  });

  it("recusa o dígito que passaria do limite", () => {
    expect(interpretarDigitacao(`${LIMITE_CENTAVOS.toString()}0`)).toBe(
      "1.000.000.000.000,00",
    );
    expect(interpretarDigitacao("9999999999999999")).toBe("999.999.999.999,99");
  });
});

describe("deMascara", () => {
  it.each([
    ["25,90", "25.90"],
    ["0,00", "0.00"],
    ["1.234,56", "1234.56"],
    ["1.000.000.000.000,00", "1000000000000.00"],
  ])("%j vira %j", (mascara, texto) => {
    expect(deMascara(mascara)).toBe(texto);
  });
});

describe("LIMITE_CENTAVOS", () => {
  it("é igual ao do backend (10**14)", () => {
    expect(LIMITE_CENTAVOS).toBe(100_000_000_000_000n);
  });
});

describe("percentualDe", () => {
  it("calcula o percentual em centavos inteiros, arredondando para baixo", () => {
    expect(percentualDe("5000.00", 30)).toBe("1500.00");
    expect(percentualDe("1.00", 33)).toBe("0.33");
    expect(percentualDe("0.99", 50)).toBe("0.49");
    expect(percentualDe("10.01", 1)).toBe("0.10");
    expect(percentualDe("0.00", 40)).toBe("0.00");
    expect(percentualDe("123.45", 100)).toBe("123.45");
  });

  it("não perde precisão com valores grandes", () => {
    expect(percentualDe("999999999999.99", 10)).toBe("99999999999.99");
  });
});

