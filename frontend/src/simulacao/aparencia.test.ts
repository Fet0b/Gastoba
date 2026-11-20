import { describe, expect, it } from "vitest";
import { chamar, ErroDaApiCliente } from "../api/cliente";
import type { Aparencia, OpcoesDeAparencia, Usuario } from "../api/tipos";
import { entrarNaSimulacao } from "./fetchSimulado";

const ESCOLHA = { matiz: 12, intensidade: "viva", textura: "pontos", nome: "  Meu cofre ", marca: "cofre" };

describe("simulação da aparência", () => {
  it("o perfil traz a padrão; salvar e restaurar espelham o backend", async () => {
    entrarNaSimulacao();
    expect((await chamar<Usuario>("/auth/eu")).aparencia?.personalizada).toBe(false);
    const salva = await chamar<Aparencia>("/aparencia", { metodo: "PUT", corpo: ESCOLHA });
    expect(salva).toEqual({ ...ESCOLHA, nome: "Meu cofre", personalizada: true });
    expect((await chamar<Usuario>("/auth/eu")).aparencia).toEqual(salva);
    await chamar("/aparencia", { metodo: "DELETE" });
    await chamar("/aparencia", { metodo: "DELETE" });
    expect((await chamar<Usuario>("/auth/eu")).aparencia?.personalizada).toBe(false);
  });

  it("lista as opções com os códigos do backend", async () => {
    entrarNaSimulacao();
    const opcoes = await chamar<OpcoesDeAparencia>("/aparencia/opcoes");
    expect(opcoes.marcas.map((o) => o.codigo)).toEqual(["olho", "inicial", "moeda", "cofre", "folha", "grafico"]);
    expect(opcoes.texturas).toHaveLength(5);
    expect(opcoes.intensidades).toHaveLength(3);
  });

  it.each([
    [{ matiz: 360 }, "aparencia_invalida"],
    [{ matiz: -1 }, "aparencia_invalida"],
    [{ nome: "   " }, "aparencia_invalida"],
    [{ nome: "x".repeat(21) }, "aparencia_invalida"],
    [{ matiz: "10" }, "requisicao_invalida"],
    [{ textura: "holograma" }, "requisicao_invalida"],
  ])("recusa %j com %s", async (troca, codigo) => {
    entrarNaSimulacao();
    await expect(
      chamar("/aparencia", { metodo: "PUT", corpo: { ...ESCOLHA, ...troca } }),
    ).rejects.toMatchObject({ status: 422, codigo });
    expect((await chamar<Usuario>("/auth/eu")).aparencia?.personalizada).toBe(false);
  });

  it("sem sessão responde 401", async () => {
    await expect(chamar("/aparencia/opcoes")).rejects.toBeInstanceOf(ErroDaApiCliente);
  });
});
