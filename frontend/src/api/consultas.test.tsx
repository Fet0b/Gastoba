import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "./cliente";
import { fetchSimulado } from "../simulacao/fetchSimulado";
import { useConsulta } from "./useConsulta";
import { useDesfazerClassificacao } from "./consultas";
import type { TransacaoImportada } from "./tipos";

import { entrarNaSimulacao } from "../simulacao/fetchSimulado";
import {
  chaveDosGastos,
  useCategorias,
  useChavesDeApi,
  useContas,
  useCriarChaveDeApi,
  useCriarConta,
  useGastos,
  useRegistrarGasto,
  useRevogarChaveDeApi,
  useTags,
} from "./consultas";

// Contra o fetch simulado (vazio e sem sessão a cada teste, pelo preparar.ts;
// aqui com a sessão aberta).
beforeEach(() => {
  entrarNaSimulacao();
});

describe("chaveDosGastos", () => {
  it("serializa os filtros definidos numa ordem fixa", () => {
    expect(
      chaveDosGastos({ categoria: "lazer", fim: "2026-10-31", tag: "pix", inicio: "2026-10-01" }),
    ).toBe("gastos?inicio=2026-10-01&fim=2026-10-31&tag=pix&categoria=lazer");
  });
});

describe("consultas", () => {
  it("registrar um gasto atualiza contas, gastos e tags montados", async () => {
    const filtros = { inicio: "2026-10-01", fim: "2026-10-31" };
    const { result } = renderHook(() => ({
      contas: useContas(),
      gastos: useGastos(filtros),
      tags: useTags(),
      categorias: useCategorias(),
      criarConta: useCriarConta(),
      registrarGasto: useRegistrarGasto(),
    }));
    await waitFor(() => expect(result.current.contas.carregando).toBe(false));

    let contaId = "";
    await act(async () => {
      const conta = await result.current.criarConta.executar({ nome: "Nubank", saldo_inicial: "100.00" });
      contaId = conta?.id ?? "";
    });
    await waitFor(() => expect(result.current.contas.dados).toHaveLength(1));

    await act(async () => {
      await result.current.registrarGasto.executar({
        conta_id: contaId,
        valor: "25.90",
        descricao: "Mercado",
        data: "2026-10-10",
        categoria: "conforto",
        tags: ["Pix"],
      });
    });

    await waitFor(() => expect(result.current.contas.dados?.[0].saldo).toBe("74.10"));
    await waitFor(() => expect(result.current.gastos.dados).toHaveLength(1));
    await waitFor(() => expect(result.current.tags.dados).toEqual(["pix"]));
    expect(result.current.categorias.dados).toHaveLength(5);
  });

  it("a mutação guarda o erro da API", async () => {
    const { result } = renderHook(() => useCriarConta());

    await act(async () => {
      await result.current.executar({ nome: "   " });
    });

    expect(result.current.erro).toMatchObject({ status: 422, codigo: "nome_invalido" });
  });
});

describe("chaves de API", () => {
  it("criar e revogar atualizam a lista montada; o segredo só vem na criação", async () => {
    const { result } = renderHook(() => ({
      chaves: useChavesDeApi(),
      criar: useCriarChaveDeApi(),
      revogar: useRevogarChaveDeApi(),
    }));
    await waitFor(() => expect(result.current.chaves.dados).toEqual([]));

    let id = "";
    let segredo = "";
    await act(async () => {
      const criada = await result.current.criar.executar({ nome: "Script", escopo: "leitura" });
      id = criada?.id ?? "";
      segredo = criada?.segredo ?? "";
    });
    expect(segredo).toMatch(/^gapi_/);
    await waitFor(() => expect(result.current.chaves.dados).toHaveLength(1));
    expect(result.current.chaves.dados?.[0]).not.toHaveProperty("segredo");

    await act(async () => {
      await result.current.revogar.executar(id);
    });
    await waitFor(() => expect(result.current.chaves.dados).toEqual([]));
  });

  it("revogar uma chave que não existe guarda o erro e recarrega a lista", async () => {
    const { result } = renderHook(() => ({
      chaves: useChavesDeApi(),
      criar: useCriarChaveDeApi(),
      revogar: useRevogarChaveDeApi(),
    }));
    await waitFor(() => expect(result.current.chaves.carregando).toBe(false));
    await act(async () => {
      await result.current.criar.executar({ nome: "Script", escopo: "escrita" });
    });
    await waitFor(() => expect(result.current.chaves.dados).toHaveLength(1));
    const id = result.current.chaves.dados?.[0].id ?? "";
    await act(async () => {
      await result.current.revogar.executar(id);
    });
    await waitFor(() => expect(result.current.chaves.dados).toEqual([]));

    await act(async () => {
      await result.current.revogar.executar(id);
    });

    expect(result.current.revogar.erro).toMatchObject({
      status: 404,
      codigo: "chave_de_api_nao_encontrada",
    });
  });
});


describe("cache após desfazer classificação", () => {
  it.each([false, true])("recarrega os oito prefixos mesmo na falha: %s", async (falhar) => {
    await chamar("/sincronizacoes", { metodo: "POST" });
    const caixa = await chamar<TransacaoImportada[]>("/transacoes-importadas");
    const t = caixa.find((t) => t.sentido === "saida")!;
    const criado = await chamar<{ id: string }>(`/transacoes-importadas/${t.id}/aceitar`, { metodo: "POST", corpo: { como_investimento: true } });
    const prefixos = ["movimentos-de-investimento", "transacoes-importadas", "investimentos", "metas", "gastos", "ganhos", "resumos", "tags"];
    const buscas = prefixos.map(() => vi.fn(async () => "consultado"));
    const { result } = renderHook(() => ({
      consultas: prefixos.map((prefixo, i) => useConsulta(`${prefixo}?teste=1`, buscas[i])),
      desfazer: useDesfazerClassificacao(),
    }));
    await waitFor(() => expect(result.current.consultas.every((c) => !c.carregando)).toBe(true));
    if (falhar) vi.stubGlobal("fetch", (url: RequestInfo | URL, opcoes?: RequestInit) => String(url).includes("desfazer-classificacao") ? Promise.resolve(new Response(JSON.stringify({ erro: { codigo: "principal_insuficiente", mensagem: "Exemplo" } }), { status: 422 })) : fetchSimulado(url, opcoes));
    await act(async () => { await result.current.desfazer.executar({ movimentoId: criado.id }); });
    await waitFor(() => buscas.forEach((buscar) => expect(buscar).toHaveBeenCalledTimes(2)));
    expect(Boolean(result.current.desfazer.erro)).toBe(falhar);
  });
});
