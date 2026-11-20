import { describe, expect, it } from "vitest";

import type { Conta } from "../api/tipos";
import { contasParecidas, identificacaoDaConta, rotuloDeOutraConta, textoDaConta } from "./identificacao";

function conta(extra: Partial<Conta> & { id: string }): Conta {
  return {
    nome: "Nubank",
    saldo: "0.00",
    origem: "open_finance",
    tipo: "corrente",
    rotulo: "Nubank",
    apelido: null,
    nome_no_banco: "Nubank",
    final_do_numero: null,
    ...extra,
  };
}

describe("identificacaoDaConta", () => {
  it("traz o rótulo, o tipo por extenso e o final", () => {
    expect(identificacaoDaConta(conta({ id: "a", final_do_numero: "0412" }))).toEqual({
      rotulo: "Nubank",
      tipo: "Conta corrente",
      final: "final 0412",
    });
  });

  it.each([
    ["cartao", "Cartão de crédito"],
    ["remunerada", "Conta investimentos"],
    ["corrente", "Conta corrente"],
  ] as const)("o tipo %s vira %s", (tipo, texto) => {
    expect(identificacaoDaConta(conta({ id: "a", tipo })).tipo).toBe(texto);
  });

  it("sem número do banco não há final: nada é inventado", () => {
    expect(identificacaoDaConta(conta({ id: "a" })).final).toBeNull();
  });

  it("usa o rótulo da API e nunca o nome interno com o sequencial", () => {
    const identificacao = identificacaoDaConta(conta({ id: "a", nome: "Nubank (2)" }));
    expect(identificacao.rotulo).toBe("Nubank");
  });

  it("o apelido vale no lugar do nome do banco", () => {
    expect(
      identificacaoDaConta(conta({ id: "a", rotulo: "Conta da casa", apelido: "Conta da casa" })).rotulo,
    ).toBe("Conta da casa");
  });
});

describe("textoDaConta", () => {
  it("junta rótulo, tipo e final em uma linha", () => {
    expect(textoDaConta(conta({ id: "a", final_do_numero: "0412" }))).toBe("Nubank, final 0412, Conta corrente");
  });

  it("omite o tipo quando o rótulo já é igual a ele, sem distinguir maiúsculas e acentos", () => {
    expect(textoDaConta(conta({ id: "a", rotulo: "Conta Corrente", final_do_numero: "0412" }))).toBe(
      "Conta Corrente, final 0412",
    );
    expect(textoDaConta(conta({ id: "a", tipo: "cartao", rotulo: "CARTAO DE CREDITO" }))).toBe("CARTAO DE CREDITO");
  });

  it("omite o final quando não há", () => {
    expect(textoDaConta(conta({ id: "a", tipo: "cartao" }))).toBe("Nubank, Cartão de crédito");
  });
});

describe("contasParecidas", () => {
  it("duas contas sem final, do mesmo rótulo e tipo, são parecidas", () => {
    const contas = [conta({ id: "a" }), conta({ id: "b", nome: "Nubank (2)" })];
    expect([...contasParecidas(contas)].sort()).toEqual(["a", "b"]);
  });

  it("finais diferentes distinguem as contas", () => {
    const contas = [
      conta({ id: "a", final_do_numero: "0412" }),
      conta({ id: "b", final_do_numero: "9876" }),
    ];
    expect(contasParecidas(contas).size).toBe(0);
  });

  it("uma com final e outra sem: só a sem final continua parecida", () => {
    const contas = [conta({ id: "a", final_do_numero: "0412" }), conta({ id: "b" })];
    expect([...contasParecidas(contas)]).toEqual(["b"]);
  });

  it("finais iguais não distinguem", () => {
    const contas = [
      conta({ id: "a", final_do_numero: "0412" }),
      conta({ id: "b", final_do_numero: "0412" }),
    ];
    expect([...contasParecidas(contas)].sort()).toEqual(["a", "b"]);
  });

  it("tipos diferentes já distinguem", () => {
    const contas = [conta({ id: "a" }), conta({ id: "b", tipo: "cartao" })];
    expect(contasParecidas(contas).size).toBe(0);
  });

  it("o rótulo é comparado sem distinguir maiúsculas", () => {
    const contas = [conta({ id: "a", rotulo: "Casa" }), conta({ id: "b", rotulo: "casa" })];
    expect([...contasParecidas(contas)].sort()).toEqual(["a", "b"]);
  });
});

describe("rotuloDeOutraConta", () => {
  const contas = [
    conta({ id: "a", rotulo: "Nubank" }),
    conta({ id: "b", rotulo: "Conta da Casa", apelido: "Conta da Casa" }),
  ];

  it("devolve o rótulo da outra conta quando o apelido digitado é igual, sem distinguir maiúsculas, acentos e espaços das pontas", () => {
    expect(rotuloDeOutraConta(contas, "a", "  conta da CASA ")).toBe("Conta da Casa");
    expect(rotuloDeOutraConta(contas, "b", "NÚBANK")).toBe("Nubank");
  });

  it("não acusa a própria conta nem um texto diferente ou vazio", () => {
    expect(rotuloDeOutraConta(contas, "a", "Nubank")).toBeNull();
    expect(rotuloDeOutraConta(contas, "a", "Outro")).toBeNull();
    expect(rotuloDeOutraConta(contas, "a", "   ")).toBeNull();
  });
});
