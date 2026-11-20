import { describe, expect, it } from "vitest";

import { textoDoBanco } from "./textoDoBanco";

describe("textoDoBanco", () => {
  it.each([
    ["OXXO LARGO DO AROUCHE SAO PAULO", "Oxxo Largo Do Arouche Sao Paulo"],
    ["PIX ENVIADO MARIA DA SILVA", "Pix Enviado Maria Da Silva"],
    ["MERCADO*LIVRE", "Mercado*Livre"],
  ])("caixa alta vira texto normal: %s", (entrada, esperado) => {
    expect(textoDoBanco(entrada)).toBe(esperado);
  });

  it("preserva siglas conhecidas e códigos de ativo e com número", () => {
    expect(textoDoBanco("COMPRA ITUB4 XP CDB")).toBe("Compra ITUB4 XP CDB");
    expect(textoDoBanco("LIQ BOLSA 12345")).toBe("Liq Bolsa 12345");
    expect(textoDoBanco("UBER TRIP 7A9B")).toBe("Uber Trip 7A9B");
  });

  it("caixa mista fica intocada", () => {
    expect(textoDoBanco("MariaBernadete")).toBe("MariaBernadete");
    expect(textoDoBanco("Pix recebido de João")).toBe("Pix recebido de João");
  });

  it("não tira 'S.A.', 'LTDA' nem 'BANCO' de uma descrição", () => {
    expect(textoDoBanco("LOJA CENTRAL S.A.")).toBe("Loja Central S.A.");
    expect(textoDoBanco("PAGAMENTO BANCO INTER LTDA")).toBe("Pagamento Banco Inter LTDA");
  });

  it("vazio e espaços sobram como vieram", () => {
    expect(textoDoBanco("")).toBe("");
    expect(textoDoBanco("  ")).toBe("  ");
  });
});
