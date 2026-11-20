import { describe, expect, it } from "vitest";

import { chamar } from "../api/cliente";
import type { Conta } from "../api/tipos";
import { entrarNaSimulacao } from "./fetchSimulado";

async function criar(nome: string): Promise<Conta> {
  return chamar<Conta>("/contas", { metodo: "POST", corpo: { nome } });
}

describe("simulação do apelido da conta", () => {
  it("a conta nova traz o rótulo e os campos do banco vazios", async () => {
    entrarNaSimulacao();
    expect(await criar("Carteira")).toMatchObject({
      rotulo: "Carteira",
      apelido: null,
      nome_no_banco: null,
      final_do_numero: null,
    });
  });

  it("define, troca e remove o apelido, e a listagem segue o rótulo", async () => {
    entrarNaSimulacao();
    const conta = await criar("Zeta");
    await criar("Beta");

    const dada = await chamar<Conta>(`/contas/${conta.id}/apelido`, {
      metodo: "PUT",
      corpo: { apelido: "  alfa " },
    });
    expect(dada).toMatchObject({ apelido: "alfa", rotulo: "alfa", nome: "Zeta" });
    expect((await chamar<Conta[]>("/contas")).map((c) => c.rotulo)).toEqual(["alfa", "Beta"]);

    await chamar(`/contas/${conta.id}/apelido`, { metodo: "DELETE" });
    await chamar(`/contas/${conta.id}/apelido`, { metodo: "DELETE" });
    expect((await chamar<Conta[]>("/contas")).map((c) => c.rotulo)).toEqual(["Beta", "Zeta"]);
  });

  it.each(["", "   ", "x".repeat(41)])("recusa o apelido %j", async (apelido) => {
    entrarNaSimulacao();
    const conta = await criar("Carteira");
    await expect(
      chamar(`/contas/${conta.id}/apelido`, { metodo: "PUT", corpo: { apelido } }),
    ).rejects.toMatchObject({ status: 422, codigo: "apelido_invalido" });
  });

  it("apelido de tipo errado é requisição inválida", async () => {
    entrarNaSimulacao();
    const conta = await criar("Carteira");
    await expect(
      chamar(`/contas/${conta.id}/apelido`, { metodo: "PUT", corpo: { apelido: 5 } }),
    ).rejects.toMatchObject({ status: 422, codigo: "requisicao_invalida" });
  });

  it("apelido repetido em outra conta é 409; na mesma conta, não", async () => {
    entrarNaSimulacao();
    const a = await criar("A");
    const b = await criar("B");
    await chamar(`/contas/${a.id}/apelido`, { metodo: "PUT", corpo: { apelido: "Casa" } });
    await expect(
      chamar(`/contas/${b.id}/apelido`, { metodo: "PUT", corpo: { apelido: "Casa" } }),
    ).rejects.toMatchObject({
      status: 409,
      codigo: "apelido_ja_existe",
      message: "Já existe uma conta com esse apelido.",
    });
    await chamar(`/contas/${a.id}/apelido`, { metodo: "PUT", corpo: { apelido: "Casa" } });
  });

  it("conta inexistente é 404", async () => {
    entrarNaSimulacao();
    await expect(
      chamar(`/contas/${crypto.randomUUID()}/apelido`, { metodo: "PUT", corpo: { apelido: "X" } }),
    ).rejects.toMatchObject({ status: 404, codigo: "conta_nao_encontrada" });
  });

  it("a sincronização simulada traz nome no banco e final, e uma conta sem final", async () => {
    entrarNaSimulacao();
    await chamar("/sincronizacoes", { metodo: "POST" });
    const contas = await chamar<Conta[]>("/contas");
    const corrente = contas.find((c) => c.nome_no_banco === "Conta Corrente");
    expect(corrente).toMatchObject({ rotulo: "Conta Corrente", final_do_numero: "0412" });
  });
});
