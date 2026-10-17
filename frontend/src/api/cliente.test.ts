import { beforeEach, describe, expect, it, vi } from "vitest";

import { entrarNaSimulacao, fetchSimulado } from "../simulacao/fetchSimulado";
import {
  aoPerderASessao,
  chamar,
  ErroDaApiCliente,
  MENSAGEM_SEM_RESPOSTA,
  URL_BASE,
} from "./cliente";
import type { Conta } from "./tipos";

// O preparar.ts troca o fetch pelo fetchSimulado (vazio e sem sessão) antes de cada teste.
beforeEach(() => {
  entrarNaSimulacao();
});

function respostaDeErro(status: number, codigo: string, cabecalhos?: Record<string, string>): Response {
  return Response.json({ erro: { codigo, mensagem: "Mensagem da API." } }, { status, headers: cabecalhos });
}

async function erroDe(promessa: Promise<unknown>): Promise<ErroDaApiCliente> {
  try {
    await promessa;
  } catch (erro) {
    expect(erro).toBeInstanceOf(ErroDaApiCliente);
    return erro as ErroDaApiCliente;
  }
  throw new Error("A chamada deveria ter falhado.");
}

describe("chamar", () => {
  it("devolve o JSON da resposta de sucesso", async () => {
    const criada = await chamar<Conta>("/contas", { metodo: "POST", corpo: { nome: "Nubank" } });

    expect(criada.nome).toBe("Nubank");
    expect(await chamar<Conta[]>("/contas")).toEqual([criada]);
  });

  it("envia JSON com o método e o sinal informados", async () => {
    const espiao = vi.fn(fetchSimulado);
    vi.stubGlobal("fetch", espiao);
    const controle = new AbortController();

    await chamar("/contas", { metodo: "POST", corpo: { nome: "Nubank" }, signal: controle.signal });

    const [url, opcoes] = espiao.mock.calls[0];
    expect(url).toBe(`${URL_BASE}/contas`);
    expect(opcoes?.method).toBe("POST");
    expect(opcoes?.body).toBe('{"nome":"Nubank"}');
    expect(new Headers(opcoes?.headers).get("content-type")).toBe("application/json");
    expect(opcoes?.signal).toBe(controle.signal);
  });

  it("monta a query string só com os parâmetros definidos", async () => {
    const espiao = vi.fn(fetchSimulado);
    vi.stubGlobal("fetch", espiao);

    await chamar("/gastos", {
      parametros: { inicio: "2026-10-01", fim: "2026-10-31", conta_id: undefined, tag: "mercado livre" },
    });

    expect(espiao.mock.calls[0][0]).toBe(
      `${URL_BASE}/gastos?inicio=2026-10-01&fim=2026-10-31&tag=mercado+livre`,
    );
  });

  it("transforma a resposta de erro da API em ErroDaApiCliente com detalhes", async () => {
    const erro = await erroDe(chamar("/contas", { metodo: "POST", corpo: { saldo_inicial: 10 } }));

    expect(erro.status).toBe(422);
    expect(erro.codigo).toBe("requisicao_invalida");
    expect(erro.mensagem).toBe("A requisição tem campos ausentes ou inválidos.");
    expect(erro.message).toBe(erro.mensagem);
    expect(erro.detalhes?.map((detalhe) => detalhe.campo)).toEqual(["body.nome", "body.saldo_inicial"]);
  });

  it("erro sem detalhes deixa detalhes indefinido", async () => {
    await chamar("/contas", { metodo: "POST", corpo: { nome: "Nubank" } });

    const erro = await erroDe(chamar("/contas", { metodo: "POST", corpo: { nome: "Nubank" } }));

    expect(erro.status).toBe(409);
    expect(erro.codigo).toBe("conta_ja_existe");
    expect(erro.detalhes).toBeUndefined();
  });

  it("aceita detalhes nulo, que o esquema OpenAPI do backend permite", async () => {
    const corpo = { erro: { codigo: "conta_nao_encontrada", mensagem: "Conta não encontrada.", detalhes: null } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(corpo, { status: 404 })));

    const erro = await erroDe(chamar("/gastos"));

    expect(erro.codigo).toBe("conta_nao_encontrada");
    expect(erro.detalhes).toBeUndefined();
  });

  it("falha de rede vira sem_resposta", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const erro = await erroDe(chamar("/contas"));

    expect(erro.codigo).toBe("sem_resposta");
    expect(erro.status).toBe(0);
    expect(erro.mensagem).toBe(MENSAGEM_SEM_RESPOSTA);
    expect(MENSAGEM_SEM_RESPOSTA).toBe("Não foi possível falar com o servidor.");
  });

  it.each([
    ["erro sem o formato da API", new Response("<h1>Bad Gateway</h1>", { status: 502 })],
    ["erro com JSON de outro formato", Response.json({ detail: "Method Not Allowed" }, { status: 405 })],
    ["sucesso com corpo que não é JSON", new Response("ok", { status: 200 })],
  ])("%s vira sem_resposta", async (_caso, resposta) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta));

    expect((await erroDe(chamar("/contas"))).codigo).toBe("sem_resposta");
  });

  it("repassa o cancelamento sem transformá-lo em sem_resposta", async () => {
    const controle = new AbortController();
    controle.abort();

    await expect(chamar("/contas", { signal: controle.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("chamar com a sessão por cookie", () => {
  it("usa http://localhost:8000 por padrão (mesmo site da página, por causa do SameSite=Strict)", () => {
    if (import.meta.env.VITE_API_URL) return; // configurado à parte: não há padrão a conferir
    expect(URL_BASE).toBe("http://localhost:8000");
  });

  it.each(["GET", "POST", "PUT", "DELETE"] as const)("envia o cookie (credentials include) no %s", async (metodo) => {
    const espiao = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", espiao);

    await chamar("/contas", { metodo });

    expect(espiao.mock.calls[0][1]?.credentials).toBe("include");
  });

  it("manda o cabeçalho anti-CSRF em toda requisição que não é GET", async () => {
    const espiao = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", espiao);

    await chamar("/contas");
    await chamar("/contas", { metodo: "POST", corpo: { nome: "Nubank" } });
    await chamar("/auth/sair", { metodo: "POST" });
    await chamar("/chaves-de-api/1", { metodo: "DELETE" });

    const cabecalhos = espiao.mock.calls.map(
      (chamada) => new Headers((chamada as unknown as [string, RequestInit])[1].headers),
    );
    expect(cabecalhos.map((c) => c.get("X-Gastoba-Requisicao"))).toEqual([null, "1", "1", "1"]);
    // Sem corpo, sem content-type; com corpo, JSON.
    expect(cabecalhos.map((c) => c.get("content-type"))).toEqual([
      null,
      "application/json",
      null,
      null,
    ]);
  });

  it("DELETE com resposta 204 sem corpo devolve undefined", async () => {
    const espiao = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", espiao);

    expect(await chamar<void>("/chaves-de-api/1", { metodo: "DELETE" })).toBeUndefined();
    expect(espiao.mock.calls[0][1]?.method).toBe("DELETE");
  });

  it.each([
    ["120", 120],
    [" 7 ", 7],
    ["0", 0],
    ["abc", undefined],
    ["1.5", undefined],
    ["-3", undefined],
    ["Wed, 21 Oct 2026 07:28:00 GMT", undefined],
  ])("lê o Retry-After %j como %j segundos", async (valor, esperado) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respostaDeErro(429, "muitas_tentativas", { "Retry-After": valor })),
    );

    const erro = await erroDe(chamar("/auth/entrar", { metodo: "POST", corpo: {} }));

    expect(erro.codigo).toBe("muitas_tentativas");
    expect(erro.esperarSegundos).toBe(esperado);
  });

  it("sem Retry-After, esperarSegundos fica indefinido", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaDeErro(429, "muitas_tentativas")));

    expect((await erroDe(chamar("/auth/entrar", { metodo: "POST", corpo: {} }))).esperarSegundos).toBeUndefined();
  });

  it("401 nao_autenticado avisa os ouvintes da sessão perdida, até serem removidos", async () => {
    const ouvinte = vi.fn();
    const remover = aoPerderASessao(ouvinte);
    vi.stubGlobal("fetch", vi.fn(async () => respostaDeErro(401, "nao_autenticado")));

    const erro = await erroDe(chamar("/contas"));
    expect(erro.status).toBe(401);
    expect(ouvinte).toHaveBeenCalledTimes(1);

    remover();
    await erroDe(chamar("/contas"));
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["401 credenciais_invalidas", respostaDeErro(401, "credenciais_invalidas")],
    ["403 requisicao_invalida_origem", respostaDeErro(403, "requisicao_invalida_origem")],
    ["401 fora do formato da API", new Response("nao", { status: 401 })],
  ])("%s não avisa que a sessão acabou", async (_caso, resposta) => {
    const ouvinte = vi.fn();
    const remover = aoPerderASessao(ouvinte);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta));

    await erroDe(chamar("/auth/entrar", { metodo: "POST", corpo: {} }));

    expect(ouvinte).not.toHaveBeenCalled();
    remover();
  });

  it("contra a simulação: sem sessão a rota de negócio responde 401 nao_autenticado", async () => {
    await chamar("/auth/sair", { metodo: "POST" });
    const ouvinte = vi.fn();
    const remover = aoPerderASessao(ouvinte);

    const erro = await erroDe(chamar("/contas"));

    expect(erro).toMatchObject({ status: 401, codigo: "nao_autenticado" });
    expect(ouvinte).toHaveBeenCalledTimes(1);
    remover();
  });
});
