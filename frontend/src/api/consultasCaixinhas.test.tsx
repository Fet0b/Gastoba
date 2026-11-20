import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { entrarNaSimulacao, fetchSimulado } from "../simulacao/fetchSimulado";
import { invalidar, limparCache } from "./useConsulta";
import {
  useCriarDestinacaoCadastrada,
  useDefinirIconeDaCaixinha,
  useDestinacoesCadastradas,
  useExcluirDestinacaoCadastrada,
} from "./consultas";

beforeEach(() => {
  limparCache();
  entrarNaSimulacao();
});

describe("catálogo de finalidades cadastradas", () => {
  it("lista um catálogo vazio independente das posições e cria apenas uma finalidade", async () => {
    const { result } = renderHook(() => ({
      catalogo: useDestinacoesCadastradas(),
      criar: useCriarDestinacaoCadastrada(),
    }));
    await waitFor(() => expect(result.current.catalogo.carregando).toBe(false));
    expect(result.current.catalogo.dados).toEqual([]);

    await act(async () => {
      await result.current.criar.executar({ nome: "  VIAGEM   São João " });
    });
    await waitFor(() => expect(result.current.catalogo.dados).toHaveLength(1));
    expect(result.current.catalogo.dados?.[0]).toMatchObject({ nome: "viagem são joão" });
    expect(result.current.catalogo.dados?.[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("colisão após normalização é erro e não troca a identidade já cadastrada", async () => {
    const { result } = renderHook(() => ({
      catalogo: useDestinacoesCadastradas(),
      criar: useCriarDestinacaoCadastrada(),
    }));
    await waitFor(() => expect(result.current.catalogo.carregando).toBe(false));
    await act(async () => {
      await result.current.criar.executar({ nome: "Viagem" });
    });
    const original = result.current.catalogo.dados?.[0].id;
    await act(async () => {
      await result.current.criar.executar({ nome: " VIAGEM " });
    });

    expect(result.current.criar.erro).toMatchObject({ codigo: "destinacao_ja_cadastrada" });
    expect(result.current.catalogo.dados?.map((item) => item.id)).toEqual([original]);
  });

  it("não duplica identidade quando a resposta da primeira criação se perde", async () => {
    let perdeuResposta = false;
    vi.stubGlobal("fetch", async (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
      const resposta = await fetchSimulado(entrada, opcoes);
      if (!perdeuResposta && String(entrada).includes("/destinacoes-cadastradas")) {
        perdeuResposta = true;
        throw new TypeError("conexão interrompida após gravar");
      }
      return resposta;
    });
    const { result } = renderHook(() => ({
      catalogo: useDestinacoesCadastradas(),
      criar: useCriarDestinacaoCadastrada(),
    }));
    await waitFor(() => expect(result.current.catalogo.carregando).toBe(false));
    await act(async () => {
      await result.current.criar.executar({ nome: "Viagem" });
    });
    await waitFor(() => expect(result.current.catalogo.dados).toHaveLength(1));
    const id = result.current.catalogo.dados![0].id;
    await act(async () => {
      await result.current.criar.executar({ nome: "Viagem" });
    });
    expect(result.current.criar.erro).toMatchObject({ codigo: "destinacao_ja_cadastrada" });
    expect(result.current.catalogo.dados?.map((item) => item.id)).toEqual([id]);
  });

  it("preserva erro de carga e permite tentar novamente", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ erro: { codigo: "temporario", mensagem: "Falha" } }), { status: 503 }))
      .mockImplementation(fetchSimulado);
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useDestinacoesCadastradas());
    await waitFor(() => expect(result.current.erro).not.toBeNull());
    expect(result.current.dados).toBeUndefined();
    await act(async () => invalidar("destinacoes-cadastradas"));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.dados).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("exclui uma finalidade vazia, rejeita repetição e permite recriar com nova identidade", async () => {
    const { result } = renderHook(() => ({
      catalogo: useDestinacoesCadastradas(),
      criar: useCriarDestinacaoCadastrada(),
      excluir: useExcluirDestinacaoCadastrada(),
    }));
    await waitFor(() => expect(result.current.catalogo.carregando).toBe(false));
    await act(async () => {
      await result.current.criar.executar({ nome: "Viagem" });
    });
    const id = result.current.catalogo.dados![0].id;
    await act(async () => {
      await result.current.excluir.executar(id);
    });
    await waitFor(() => expect(result.current.catalogo.dados).toEqual([]));
    await act(async () => {
      await result.current.criar.executar({ nome: "Viagem" });
    });
    expect(result.current.catalogo.dados?.[0].id).not.toBe(id);
  });
});

describe("ícone e cor da caixinha", () => {
  it("cria com cor e ícone e troca o ícone, atualizando o catálogo", async () => {
    const { result } = renderHook(() => ({
      catalogo: useDestinacoesCadastradas(),
      criar: useCriarDestinacaoCadastrada(),
      icone: useDefinirIconeDaCaixinha(),
    }));
    await waitFor(() => expect(result.current.catalogo.carregando).toBe(false));

    await act(async () => {
      await result.current.criar.executar({ nome: "Viagem", cor: "coral", icone: "aviao" });
    });
    await waitFor(() => expect(result.current.catalogo.dados).toHaveLength(1));
    expect(result.current.catalogo.dados?.[0]).toMatchObject({ cor: "coral", icone: "aviao" });

    await act(async () => {
      await result.current.icone.executar({ id: result.current.catalogo.dados![0]!.id, icone: "casa" });
    });
    await waitFor(() => expect(result.current.catalogo.dados?.[0]?.icone).toBe("casa"));
  });

  it("expõe o erro da API quando a caixinha não existe", async () => {
    const { result } = renderHook(() => useDefinirIconeDaCaixinha());

    await act(async () => {
      await result.current.executar({ id: crypto.randomUUID(), icone: "casa" });
    });

    expect(result.current.erro).toMatchObject({ codigo: "destinacao_cadastrada_nao_encontrada" });
  });
});
