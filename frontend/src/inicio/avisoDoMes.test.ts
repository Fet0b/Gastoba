import { describe, expect, it } from "vitest";

import type { ProgressoDaMeta, ResumoDasMetas, SituacaoDaMeta } from "../api/tipos";
import { avisoDoMes } from "./avisoDoMes";

const NOMES = { lazer: "Lazer", conforto: "Conforto", gasto_fixo: "Gasto fixo" };

function meta(
  categoria: string,
  situacao: SituacaoDaMeta,
  percentualUsado: number | null,
  restante = "10.00",
): ProgressoDaMeta {
  return {
    categoria,
    percentual: 10,
    limite: "100.00",
    gasto: "50.00",
    restante,
    percentual_usado: percentualUsado,
    situacao,
  };
}

function resumo(...metas: ProgressoDaMeta[]): ResumoDasMetas {
  return { mes: "2026-04", renda: "1000.00", metas };
}

describe("avisoDoMes", () => {
  it("escolhe estourou antes de alerta", () => {
    const aviso = avisoDoMes(
      resumo(meta("lazer", "alerta", 95), meta("conforto", "estourou", 120, "-40.00")),
      NOMES,
    );

    expect(aviso?.categoria).toBe("conforto");
    expect(aviso?.situacao).toBe("estourou");
  });

  it("entre duas em alerta, escolhe a de maior percentual usado", () => {
    const aviso = avisoDoMes(resumo(meta("lazer", "alerta", 85), meta("conforto", "alerta", 92)), NOMES);

    expect(aviso?.categoria).toBe("conforto");
  });

  it("no empate, fica a primeira na ordem do enum", () => {
    const aviso = avisoDoMes(resumo(meta("lazer", "alerta", 85), meta("conforto", "alerta", 85)), NOMES);

    expect(aviso?.categoria).toBe("lazer");
  });

  it("o texto de alerta traz o nome e o percentual", () => {
    expect(avisoDoMes(resumo(meta("lazer", "alerta", 85)), NOMES)?.texto).toBe("Lazer a 85% da meta");
  });

  it("o texto de estouro traz o nome e quanto passou", () => {
    const aviso = avisoDoMes(resumo(meta("conforto", "estourou", 120, "-40.00")), NOMES);

    expect(aviso?.texto).toBe("Conforto estourou a meta em R$\u{a0}40,00");
  });

  it("sem percentual usado (limite zero), um estouro ainda ganha de um alerta", () => {
    const aviso = avisoDoMes(
      resumo(meta("lazer", "alerta", 99), meta("conforto", "estourou", null, "-5.00")),
      NOMES,
    );

    expect(aviso?.categoria).toBe("conforto");
  });

  it("usa o código quando falta o nome da categoria", () => {
    expect(avisoDoMes(resumo(meta("outra", "alerta", 90)), NOMES)?.texto).toBe("outra a 90% da meta");
  });

  it("só dentro e sem_renda dão null", () => {
    expect(avisoDoMes(resumo(meta("lazer", "dentro", 10), meta("conforto", "sem_renda", null)), NOMES)).toBeNull();
    expect(avisoDoMes(resumo(), NOMES)).toBeNull();
  });

  it("resumo undefined dá null", () => {
    expect(avisoDoMes(undefined, NOMES)).toBeNull();
  });
});
