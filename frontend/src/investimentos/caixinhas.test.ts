import { describe, expect, it } from "vitest";

import type { DestinacaoCadastrada, Investimento } from "../api/tipos";
import { ICONE_PADRAO_DA_CAIXINHA, ICONES_DA_CAIXINHA, iconeDaCaixinha, resumirCaixinhas, rotuloDoRendimento } from "./caixinhas";

function caixinha(nome: string, extras: Partial<DestinacaoCadastrada> = {}): DestinacaoCadastrada {
  return { id: `id-${nome}`, nome, icone: null, cor: null, ...extras };
}

type Parte = { tag: string | null; valor_atual: string; rendimento: string };

function posicao(id: string, nome: string, partes: Parte[]): Investimento {
  return {
    id,
    nome,
    destinacoes: partes.map((p) => ({ cor: null, principal: "0.00", rentabilidade: null, ...p })),
  } as unknown as Investimento;
}

describe("resumirCaixinhas", () => {
  it("soma em centavos as partes da mesma caixinha em várias posições", () => {
    const resumo = resumirCaixinhas(
      [caixinha("viagem")],
      [
        posicao("a", "CDB A", [{ tag: "viagem", valor_atual: "100.10", rendimento: "0.10" }]),
        posicao("b", "CDB B", [{ tag: "viagem", valor_atual: "0.20", rendimento: "0.05" }]),
      ],
    );

    expect(resumo).toHaveLength(1);
    expect(resumo[0]?.valor).toBe("100.30");
    expect(resumo[0]?.rendimento).toBe("0.15");
    expect(resumo[0]?.partes.map((p) => p.investimentoId)).toEqual(["a", "b"]);
  });

  it("não perde centavos com valores que o ponto flutuante erraria", () => {
    const resumo = resumirCaixinhas(
      [caixinha("viagem")],
      [
        posicao("a", "A", [{ tag: "viagem", valor_atual: "0.10", rendimento: "0.10" }]),
        posicao("b", "B", [{ tag: "viagem", valor_atual: "0.20", rendimento: "0.20" }]),
      ],
    );

    expect(resumo[0]?.valor).toBe("0.30");
    expect(resumo[0]?.rendimento).toBe("0.30");
  });

  it("soma a mesma caixinha dividida por fração numa só posição", () => {
    const resumo = resumirCaixinhas(
      [caixinha("viagem"), caixinha("casa")],
      [
        posicao("a", "A", [
          { tag: "viagem", valor_atual: "60.00", rendimento: "6.00" },
          { tag: "casa", valor_atual: "40.00", rendimento: "4.00" },
        ]),
        posicao("b", "B", [{ tag: "viagem", valor_atual: "10.00", rendimento: "1.00" }]),
      ],
    );

    const porNome = Object.fromEntries(resumo.map((c) => [c.nome, c]));
    expect(porNome["viagem"]?.valor).toBe("70.00");
    expect(porNome["viagem"]?.rendimento).toBe("7.00");
    expect(porNome["casa"]?.valor).toBe("40.00");
    expect(porNome["casa"]?.partes).toHaveLength(1);
  });

  it("deixa de fora a parte sem caixinha e a tag fora do catálogo", () => {
    const resumo = resumirCaixinhas(
      [caixinha("viagem")],
      [
        posicao("a", "A", [
          { tag: null, valor_atual: "500.00", rendimento: "50.00" },
          { tag: "outra", valor_atual: "9.00", rendimento: "1.00" },
          { tag: "viagem", valor_atual: "1.00", rendimento: "0.00" },
        ]),
      ],
    );

    expect(resumo[0]?.valor).toBe("1.00");
    expect(resumo[0]?.partes).toHaveLength(1);
  });

  it("aceita rendimento negativo e zero", () => {
    const resumo = resumirCaixinhas(
      [caixinha("a"), caixinha("b")],
      [
        posicao("x", "X", [
          { tag: "a", valor_atual: "90.00", rendimento: "-10.00" },
          { tag: "b", valor_atual: "50.00", rendimento: "0.00" },
        ]),
      ],
    );

    expect(resumo[0]?.rendimento).toBe("-10.00");
    expect(resumo[1]?.rendimento).toBe("0.00");
  });

  it("mantém a caixinha que só existe no catálogo, com zeros e sem partes", () => {
    const resumo = resumirCaixinhas([caixinha("vazia")], []);

    expect(resumo).toEqual([
      { id: "id-vazia", nome: "vazia", icone: "cofre", cor: null, valor: "0.00", rendimento: "0.00", partes: [] },
    ]);
  });

  it("não lista parte com valor e rendimento zerados no detalhe", () => {
    const resumo = resumirCaixinhas(
      [caixinha("viagem")],
      [
        posicao("a", "A", [{ tag: "viagem", valor_atual: "0.00", rendimento: "0.00" }]),
        posicao("b", "B", [{ tag: "viagem", valor_atual: "5.00", rendimento: "0.00" }]),
      ],
    );

    expect(resumo[0]?.partes.map((p) => p.investimentoId)).toEqual(["b"]);
    expect(resumo[0]?.valor).toBe("5.00");
  });

  it("leva o ícone e a cor da caixinha", () => {
    const resumo = resumirCaixinhas([caixinha("zeta", { icone: "aviao", cor: "coral" }), caixinha("alfa", { icone: "casa" })], []);

    expect(resumo.find((c) => c.nome === "zeta")).toMatchObject({ icone: "aviao", cor: "coral" });
    expect(resumo.find((c) => c.nome === "alfa")).toMatchObject({ icone: "casa", cor: null });
  });

  it("ordena com valor primeiro, do maior para o menor (BigInt), e as sem investimentos no fim por nome", () => {
    const resumo = resumirCaixinhas(
      [caixinha("zeta"), caixinha("beta"), caixinha("alfa"), caixinha("gama"), caixinha("delta")],
      [
        posicao("a", "A", [
          { tag: "beta", valor_atual: "10.00", rendimento: "0.00" },
          { tag: "gama", valor_atual: "99999999999.99", rendimento: "0.00" },
          { tag: "alfa", valor_atual: "10.00", rendimento: "0.00" },
        ]),
      ],
    );

    // gama (maior), depois alfa e beta empatados (por nome), depois as sem investimento por nome.
    expect(resumo.map((c) => c.nome)).toEqual(["gama", "alfa", "beta", "delta", "zeta"]);
  });

  it("não perde precisão ao ordenar valores acima do limite de um número", () => {
    const resumo = resumirCaixinhas(
      [caixinha("b"), caixinha("a")],
      [posicao("x", "X", [{ tag: "a", valor_atual: "9007199254740993.00", rendimento: "0.00" }, { tag: "b", valor_atual: "9007199254740992.00", rendimento: "0.00" }])],
    );

    expect(resumo.map((c) => c.nome)).toEqual(["a", "b"]);
  });

  it("usa o nome do investimento para identificar a parte (rótulo, se houver)", () => {
    const investimento = { ...posicao("a", "CDB BANCO", [{ tag: "viagem", valor_atual: "1.00", rendimento: "0.00" }]), rotulo: "CDB Banco 2030" };

    const resumo = resumirCaixinhas([caixinha("viagem")], [investimento]);

    expect(resumo[0]?.partes[0]?.nomeDoInvestimento).toBe("CDB Banco 2030");
  });
});

describe("iconeDaCaixinha", () => {
  it("devolve o ícone conhecido e o padrão para nulo ou código desconhecido", () => {
    expect(iconeDaCaixinha("aviao")).toBe("aviao");
    expect(iconeDaCaixinha(null)).toBe(ICONE_PADRAO_DA_CAIXINHA);
    expect(iconeDaCaixinha(undefined)).toBe("cofre");
    expect(iconeDaCaixinha("foguete")).toBe("cofre");
  });

  it("lista os seis códigos, com o cofre como padrão", () => {
    expect(ICONES_DA_CAIXINHA.map((i) => i.codigo)).toEqual(["aviao", "casa", "carro", "computador", "cofre", "exclamacao"]);
    expect(ICONES_DA_CAIXINHA.every((i) => i.rotulo.length > 0)).toBe(true);
  });
});

describe("rotuloDoRendimento", () => {
  it("escreve o sinal e o tom: positivo com +, negativo com menos tipográfico, zero neutro", () => {
    expect(rotuloDoRendimento("12.30")).toEqual({ texto: "+R$\u{00A0}12,30", tom: "positivo" });
    expect(rotuloDoRendimento("-4.00")).toEqual({ texto: "\u{2212}R$\u{00A0}4,00", tom: "negativo" });
    expect(rotuloDoRendimento("0.00")).toEqual({ texto: "R$\u{00A0}0,00", tom: "neutro" });
  });
});
