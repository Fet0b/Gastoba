import { expect, it } from "vitest";
import type { PropostaDeCasamento } from "../api/tipos";
import {
  chavesDasExatas,
  diferencaComSinal,
  motivoDoBotaoDeLigar,
  rotuloDaProposta,
  rotuloDaSituacao,
  valorComSinal,
  textoDoBotaoDeLigar,
  textosDosEfeitos,
} from "./revisaoDaBolsa";

const operacao = (rotulo: string, quantidade: string, valor: string) => ({ id: rotulo, posicao_id: "p", rotulo, tipo: "COMPRA", data: "2026-11-03", quantidade, valor_bruto: valor, custos: "0.00" });
const transacao = (id: string, valor: string, situacao: PropostaDeCasamento["bruto"][number]["situacao"]) => ({ id, data: "2026-11-04", descricao: "d", valor, situacao });
const proposta = (extra: Partial<PropostaDeCasamento> = {}): PropostaDeCasamento => ({
  chave: "c", versao: "v", tipo: "compra_na_bolsa", data_do_pregao: "2026-11-03",
  operacoes: [operacao("AUPO11", "25", "2789.30")],
  bruto: [transacao("b", "2789.30", "aporte_sem_investimento")],
  taxas: [transacao("t1", "0.62", "aporte_sem_investimento"), transacao("t2", "0.13", "aporte_sem_investimento"), transacao("t3", "0.07", "aporte_sem_investimento")],
  diferenca: "0.00", diferenca_de_custo: "-0.13", confianca: "exata", motivo: null,
  efeitos: [
    { transacao_id: "b", codigo: "aporte_passa_a_ser_da_posicao" },
    { transacao_id: "t1", codigo: "taxa_deixa_de_ser_aporte" }, { transacao_id: "t2", codigo: "taxa_deixa_de_ser_aporte" }, { transacao_id: "t3", codigo: "taxa_deixa_de_ser_aporte" },
  ],
  ...extra,
});

it("rotula a proposta pelas operações", () => {
  expect(rotuloDaProposta(proposta())).toBe("Compra de AUPO11 (25)");
  expect(rotuloDaProposta(proposta({ operacoes: [operacao("BBAS3", "1", "1.00"), operacao("ITUB4", "3", "2.00")] }))).toBe("Compra de BBAS3 (1) e ITUB4 (3)");
  expect(rotuloDaProposta(proposta({ operacoes: [operacao("A", "1", "1"), operacao("B", "2", "1"), operacao("C", "3", "1")] }))).toBe("Compra de A (1), B (2) e C (3)");
  expect(rotuloDaProposta(proposta({ tipo: "venda_na_bolsa" }))).toBe("Venda de AUPO11 (25)");
  expect(rotuloDaProposta(proposta({ tipo: "resgate_de_renda_fixa", operacoes: [operacao("CDB", "1", "100.00")] }))).toBe("Resgate de CDB");
});

it("diz a situação atual do lançamento", () => {
  expect(rotuloDaSituacao("aporte_sem_investimento")).toBe("hoje: aporte sem investimento");
  expect(rotuloDaSituacao("resgate_sem_investimento")).toBe("hoje: resgate sem investimento");
  expect(rotuloDaSituacao("ganho")).toBe("hoje: ganho");
  expect(rotuloDaSituacao("pendente")).toBe("hoje: na caixa de entrada");
  expect(rotuloDaSituacao("aporte_de_outra_posicao")).toBe("hoje: ligado a outra posição");
});

it("escreve o que muda ao ligar, com valores em BigInt", () => {
  const textos = textosDosEfeitos(proposta());
  expect(textos).toContain("O aporte sem investimento de R$ 2.789,30 passa a ser o aporte de AUPO11.");
  expect(textos).toContain("As 3 taxas (R$ 0,82) deixam de ser aportes; o custo já está na operação.");
  expect(textos.at(-1)).toBe("Saldo, custo da posição e caixinhas não mudam.");
  const pendente = textosDosEfeitos(proposta({ bruto: [transacao("b", "10.00", "pendente")], taxas: [], efeitos: [{ transacao_id: "b", codigo: "aceita_a_pendente" }] }));
  expect(pendente[0]).toBe("1 lançamento da caixa de entrada passa a ser aceito como parte desta operação.");
  const ganho = textosDosEfeitos(proposta({ efeitos: [{ transacao_id: "b", codigo: "ganho_deixa_de_ser_renda" }] }));
  expect(ganho[0]).toBe("1 ganho deixa de contar como renda e passa a ser o resgate da posição.");
});

it("mostra a diferença com sinal", () => {
  expect(diferencaComSinal("0.13")).toBe("+R$ 0,13");
  expect(diferencaComSinal("-0.13")).toBe("−R$ 0,13");
  expect(diferencaComSinal("0.00")).toBe("R$ 0,00");
});

it("texto e motivo do botão de ligar", () => {
  expect(textoDoBotaoDeLigar(0)).toBe("Ligar 0 selecionadas");
  expect(textoDoBotaoDeLigar(1)).toBe("Ligar 1 selecionada");
  expect(textoDoBotaoDeLigar(3)).toBe("Ligar 3 selecionadas");
  expect(motivoDoBotaoDeLigar(0, false)).toBe("Selecione ao menos uma proposta.");
  expect(motivoDoBotaoDeLigar(2, false)).toBeNull();
  expect(motivoDoBotaoDeLigar(2, true)).toBe("Ligando as propostas…");
});

it("só as exatas entram em 'Selecionar as N com valores iguais'", () => {
  const exata = proposta({ chave: "a" });
  const escolha = proposta({ chave: "b", confianca: "precisa_escolher" });
  expect(chavesDasExatas([exata, escolha])).toEqual(["a"]);
});

it("valorComSinal: saída com menos, entrada com mais, sem sentido sem sinal", () => {
  expect(valorComSinal("1.00", "saida")).toBe("\u2212R$\u00a01,00");
  expect(valorComSinal("1.00", "entrada")).toBe("+R$\u00a01,00");
  expect(valorComSinal("1.00", null)).toBe("R$\u00a01,00");
});
