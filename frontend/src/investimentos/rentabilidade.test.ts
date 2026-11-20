import { describe, expect, it } from "vitest";
import type { Investimento } from "../api/tipos";
import { aplicadoERendimento, rentabilidadeDaPosicao, textoDaPendencia } from "./rentabilidade";

function posicao(extra: Partial<Investimento>): Investimento {
  return {
    id: "i", nome: "AUPO11", tipo: "EQUITY", subtipo: "ETF", saldo: "3692.37",
    valor_aplicado: "2789.25", rendimento: "903.12", rentabilidade: "32.37",
    origem_da_rentabilidade: null, taxa: null, atualizado_em: null, destinacoes: [], ...extra,
  };
}

describe("rentabilidadeDaPosicao", () => {
  it("com histórico incompleto não mostra a estimativa pelos aportes e dá o motivo", () => {
    const r = rentabilidadeDaPosicao(posicao({
      historico_completo: false, motivo_sem_rentabilidade: "historico_incompleto",
      pendencias: [{ tipo: "faltam_cotas", quantidade_estimada: "25" }],
    }));
    expect(r).toEqual({ tipo: "ausente", motivo: "historico_incompleto" });
  });

  it("com histórico completo mostra o período e o anualizado", () => {
    const r = rentabilidadeDaPosicao(posicao({
      historico_completo: true, rentabilidade_do_periodo: "21.00", rentabilidade_anualizada: "10.00",
    }));
    expect(r).toEqual({ tipo: "calculada", periodo: "21.00", anualizada: "10.00" });
  });

  it("sem anualizado quando o histórico tem 12 meses ou menos", () => {
    const r = rentabilidadeDaPosicao(posicao({
      historico_completo: true, rentabilidade_do_periodo: "1.00", rentabilidade_anualizada: null,
    }));
    expect(r).toEqual({ tipo: "calculada", periodo: "1.00", anualizada: null });
  });

  it("o número que a própria instituição informa continua valendo", () => {
    const r = rentabilidadeDaPosicao(posicao({
      origem_da_rentabilidade: "instituicao", rentabilidade: "4.32",
      historico_completo: false, motivo_sem_rentabilidade: "historico_incompleto",
    }));
    expect(r).toEqual({ tipo: "instituicao", valor: "4.32" });
  });

  it("resposta sem os campos novos usa só o que a instituição informa, nunca a estimativa", () => {
    const r = rentabilidadeDaPosicao(posicao({ origem_da_rentabilidade: "instituicao" }));
    expect(r).toEqual({ tipo: "instituicao", valor: "32.37" });
    expect(rentabilidadeDaPosicao(posicao({ origem_da_rentabilidade: null })))
      .toEqual({ tipo: "ausente", motivo: "historico_incompleto" });
  });
});

describe("textoDaPendencia", () => {
  it("concorda no singular quando é exatamente uma cota", () => {
    expect(textoDaPendencia({ tipo: "faltam_cotas", quantidade_estimada: "1" }, "CDB"))
      .toBe("Falta ~1 cota de CDB: informe data e preço.");
    expect(textoDaPendencia({ tipo: "faltam_cotas", quantidade_estimada: "1.00" }, "CDB"))
      .toBe("Falta ~1,00 cota de CDB: informe data e preço.");
    expect(textoDaPendencia({ tipo: "sobram_cotas", quantidade_estimada: "1" }, "CDB"))
      .toBe("Sobra ~1 cota de CDB: registre a venda.");
    expect(textoDaPendencia({ tipo: "faltam_cotas", quantidade_estimada: "10" }, "CDB"))
      .toBe("Faltam ~10 cotas de CDB: informe data e preço.");
  });

  it("pede data e preço quando faltam cotas", () => {
    expect(textoDaPendencia({ tipo: "faltam_cotas", quantidade_estimada: "25" }, "AUPO11"))
      .toBe("Faltam ~25 cotas de AUPO11: informe data e preço.");
  });
  it("pede a venda quando sobram cotas", () => {
    expect(textoDaPendencia({ tipo: "sobram_cotas", quantidade_estimada: "5" }, "AUPO11"))
      .toBe("Sobram ~5 cotas de AUPO11: registre a venda.");
  });
  it("troca o ponto decimal por vírgula", () => {
    expect(textoDaPendencia({ tipo: "faltam_cotas", quantidade_estimada: "0.5" }, "X"))
      .toBe("Faltam ~0,5 cotas de X: informe data e preço.");
  });
});

describe("aplicadoERendimento", () => {
  it("prefere o aplicado e o rendimento das operações quando o histórico fecha", () => {
    const r = aplicadoERendimento(posicao({
      valor_aplicado: "2789.25", rendimento: "902.79",
      valor_aplicado_das_operacoes: "3685.43", rendimento_das_operacoes: "6.61",
    }));
    expect(r).toEqual({ aplicado: "3685.43", rendimento: "6.61" });
  });

  it("sem os campos das operações mantém o que a instituição ou os aportes informam", () => {
    expect(aplicadoERendimento(posicao({ valor_aplicado: "2789.25", rendimento: "902.79" })))
      .toEqual({ aplicado: "2789.25", rendimento: "902.79" });
  });
});
