import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { entrarNaSimulacao, reiniciarSimulacao } from "../simulacao/fetchSimulado";
import { ErroDaApiCliente } from "./cliente";
import { entrar, eu, sair } from "./sessao";
import { useConsulta } from "./useConsulta";

// Contra o fetch simulado (vazio e sem sessão a cada teste, pelo preparar.ts).
const CREDENCIAIS = { email: "voce@exemplo.com", senha: "senha-de-exemplo-123" };

/** Monta uma consulta que conta as buscas, espera a primeira e desmonta. */
async function consultaEmCache(chave: string) {
  const buscar = vi.fn(async () => "dados");
  const { result, unmount } = renderHook(() => useConsulta(chave, buscar));
  await waitFor(() => expect(result.current.dados).toBe("dados"));
  unmount();
  return buscar;
}

async function remontar(chave: string, buscar: () => Promise<string>) {
  const { result } = renderHook(() => useConsulta(chave, buscar));
  await waitFor(() => expect(result.current.dados).toBe("dados"));
}

describe("eu", () => {
  it("devolve a pessoa da sessão", async () => {
    entrarNaSimulacao();

    expect(await eu()).toEqual({
      id: expect.any(String),
      email: "voce@exemplo.com",
      nome: "Você",
      importacao_bancaria: true,
    });
  });

  it("sem sessão, falha com 401 nao_autenticado", async () => {
    await expect(eu()).rejects.toMatchObject({ status: 401, codigo: "nao_autenticado" });
  });
});

describe("entrar", () => {
  it("abre a sessão no cookie e não devolve nem guarda o token", async () => {
    const resultado = await entrar(CREDENCIAIS);

    expect(resultado).toBeUndefined();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect((await eu()).nome).toBe("Você");
  });

  it("credenciais erradas falham com credenciais_invalidas", async () => {
    const falha = entrar({ ...CREDENCIAIS, senha: "errada" });

    await expect(falha).rejects.toBeInstanceOf(ErroDaApiCliente);
    await expect(falha).rejects.toMatchObject({ status: 401, codigo: "credenciais_invalidas" });
  });

  it("limpa o cache das consultas", async () => {
    const buscar = await consultaEmCache("contas");

    await entrar(CREDENCIAIS);
    await remontar("contas", buscar);

    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("uma falha não limpa o cache", async () => {
    const buscar = await consultaEmCache("contas");

    await entrar({ ...CREDENCIAIS, senha: "errada" }).catch(() => undefined);
    await remontar("contas", buscar);

    expect(buscar).toHaveBeenCalledTimes(1);
  });
});

describe("sair", () => {
  it("encerra a sessão e limpa o cache", async () => {
    entrarNaSimulacao();
    const buscar = await consultaEmCache("contas");

    await sair();
    await remontar("contas", buscar);

    expect(buscar).toHaveBeenCalledTimes(2);
    await expect(eu()).rejects.toMatchObject({ codigo: "nao_autenticado" });
  });

  it("sem resposta do servidor, não falha e limpa o cache", async () => {
    entrarNaSimulacao();
    const buscar = await consultaEmCache("contas");
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));

    await expect(sair()).resolves.toBeUndefined();
    await remontar("contas", buscar);

    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("um 401 (a sessão já tinha acabado) vale como saída", async () => {
    entrarNaSimulacao();
    reiniciarSimulacao();

    await expect(sair()).resolves.toBeUndefined();
  });
});
