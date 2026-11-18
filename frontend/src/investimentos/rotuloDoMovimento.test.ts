import { expect, it } from "vitest";
import type { MovimentoDeInvestimento } from "../api/tipos";
import { rotuloDoMovimento, sinalDoMovimento, valorComSinal } from "./rotuloDoMovimento";

const m = (extra: Partial<MovimentoDeInvestimento>): Pick<MovimentoDeInvestimento, "natureza" | "descricao" | "tipo"> => ({ natureza: "outra", descricao: "x", tipo: "aporte", ...extra });

it("rotula pela natureza", () => {
  expect(rotuloDoMovimento(m({ natureza: "liquidacao_de_bolsa", descricao: "LIQ BOLSA - VISTA BRUTO" }))).toBe("Liquidação da bolsa");
  expect(rotuloDoMovimento(m({ natureza: "imposto_ou_taxa", descricao: "LIQ BOLSA - VISTA TX CCP B3" }))).toBe("Taxa da B3");
  expect(rotuloDoMovimento(m({ natureza: "imposto_ou_taxa", descricao: "IRRF CDB" }))).toBe("Imposto");
  expect(rotuloDoMovimento(m({ natureza: "conta_remunerada", descricao: "CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA" }))).toBe("Aplicação automática");
  expect(rotuloDoMovimento(m({ natureza: "conta_remunerada", tipo: "resgate", descricao: "RESGATE AUTOMÁTICO" }))).toBe("Resgate automático");
  expect(rotuloDoMovimento(m({ natureza: "vencimento", tipo: "resgate", descricao: "VENCIMENTO CDB" }))).toBe("Vencimento");
  expect(rotuloDoMovimento(m({ natureza: "rendimento", tipo: "rendimento", descricao: "RENDIMENTO" }))).toBe("Rendimento");
});

it("para 'outra' usa a descrição normalizada (sem caixa alta crua nem S.A.)", () => {
  expect(rotuloDoMovimento(m({ natureza: "outra", descricao: "CDB - BANCO INTER S.A." }))).toBe("CDB Inter");
  expect(rotuloDoMovimento(m({ natureza: "outra", descricao: "Aporte para viagem" }))).toBe("Aporte para viagem");
  expect(rotuloDoMovimento(m({ natureza: undefined, descricao: "Aporte" }))).toBe("Aporte");
});

it("sinal: menos para aporte, custo e imposto; mais para resgate e rendimento", () => {
  expect(sinalDoMovimento("aporte")).toBe("−");
  expect(sinalDoMovimento("custo")).toBe("−");
  expect(sinalDoMovimento("imposto")).toBe("−");
  expect(sinalDoMovimento("resgate")).toBe("+");
  expect(sinalDoMovimento("rendimento")).toBe("+");
});

it("valor com sinal, em BigInt de centavos", () => {
  expect(valorComSinal("aporte", "45.90")).toBe("−R$ 45,90");
  expect(valorComSinal("resgate", "5000.00")).toBe("+R$ 5.000,00");
});
