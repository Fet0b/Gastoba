import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { invalidar, limparCache, useConsulta, useMutacao } from "./useConsulta";

// Buscas controladas por promessas: cada chamada fica pendente até o teste resolver.

type Adiada<T> = {
  promessa: Promise<T>;
  resolver: (valor: T) => void;
  rejeitar: (erro: unknown) => void;
};

function adiada<T>(): Adiada<T> {
  let resolver!: (valor: T) => void;
  let rejeitar!: (erro: unknown) => void;
  const promessa = new Promise<T>((sim, nao) => {
    resolver = sim;
    rejeitar = nao;
  });
  return { promessa, resolver, rejeitar };
}

/** Busca falsa: registra cada chamada (chave e sinal) e devolve uma promessa pendente. */
function buscaControlada<T>() {
  const chamadas: { chave: string; sinal: AbortSignal; adiada: Adiada<T> }[] = [];
  const criar = (chave: string) => (sinal: AbortSignal) => {
    const pendente = adiada<T>();
    chamadas.push({ chave, sinal, adiada: pendente });
    return pendente.promessa;
  };
  return { chamadas, criar };
}

describe("useConsulta", () => {
  it("começa carregando e entrega os dados da busca", async () => {
    const busca = buscaControlada<string>();
    const { result } = renderHook(() => useConsulta("contas", busca.criar("contas")));

    expect(result.current).toEqual({ dados: undefined, erro: null, carregando: true });

    await act(async () => busca.chamadas[0].adiada.resolver("dados"));

    expect(result.current).toEqual({ dados: "dados", erro: null, carregando: false });
  });

  it("mantém os dados anteriores enquanto busca a nova chave", async () => {
    const busca = buscaControlada<string>();
    const { result, rerender } = renderHook(
      ({ chave }: { chave: string }) => useConsulta(chave, busca.criar(chave)),
      { initialProps: { chave: "gastos?mes=9" } },
    );
    await act(async () => busca.chamadas[0].adiada.resolver("setembro"));

    rerender({ chave: "gastos?mes=10" });

    expect(result.current).toEqual({ dados: "setembro", erro: null, carregando: true });
    await act(async () => busca.chamadas[1].adiada.resolver("outubro"));
    expect(result.current).toEqual({ dados: "outubro", erro: null, carregando: false });
  });

  it("descarta a resposta antiga que chega depois da nova", async () => {
    const busca = buscaControlada<string>();
    const { result, rerender } = renderHook(
      ({ chave }: { chave: string }) => useConsulta(chave, busca.criar(chave)),
      { initialProps: { chave: "gastos?mes=9" } },
    );
    rerender({ chave: "gastos?mes=10" });

    await act(async () => busca.chamadas[1].adiada.resolver("outubro"));
    await act(async () => busca.chamadas[0].adiada.resolver("setembro"));

    expect(result.current.dados).toBe("outubro");
    expect(busca.chamadas[0].sinal.aborted).toBe(true);
  });

  it("no render em que a chave muda, já entrega o estado da chave nova", async () => {
    const busca = buscaControlada<string>();
    const renders: { chave: string; estado: unknown }[] = [];
    const { rerender } = renderHook(
      ({ chave }: { chave: string }) => {
        const estado = useConsulta(chave, busca.criar(chave));
        renders.push({ chave, estado });
        return estado;
      },
      { initialProps: { chave: "gastos?mes=9" } },
    );
    await act(async () => busca.chamadas[0].adiada.resolver("setembro"));
    rerender({ chave: "gastos?mes=10" });
    await act(async () => busca.chamadas[1].adiada.rejeitar(new Error("fora do ar")));

    renders.length = 0;
    rerender({ chave: "gastos?mes=9" });

    // Nenhum render mostra o erro nem os dados de outubro com a chave de setembro.
    expect(renders.length).toBeGreaterThan(0);
    for (const render of renders) {
      expect(render.estado).toEqual({ dados: "setembro", erro: null, carregando: false });
    }

    renders.length = 0;
    rerender({ chave: "gastos?mes=11" });
    expect(renders[0].estado).toEqual({ dados: "setembro", erro: null, carregando: true });
  });

  it("usa o cache numa nova montagem da mesma chave, sem buscar de novo", async () => {
    const busca = buscaControlada<string>();
    const primeira = renderHook(() => useConsulta("contas", busca.criar("contas")));
    await act(async () => busca.chamadas[0].adiada.resolver("contas"));
    primeira.unmount();

    const { result } = renderHook(() => useConsulta("contas", busca.criar("contas")));

    expect(result.current).toEqual({ dados: "contas", erro: null, carregando: false });
    expect(busca.chamadas).toHaveLength(1);
  });

  it("invalidar refaz só as consultas montadas com o prefixo e mantém os dados", async () => {
    const busca = buscaControlada<string>();
    const gastos = renderHook(() => useConsulta("gastos?mes=10", busca.criar("gastos")));
    const contas = renderHook(() => useConsulta("contas", busca.criar("contas")));
    await act(async () => {
      for (const chamada of busca.chamadas) chamada.adiada.resolver(`${chamada.chave} 1`);
    });

    act(() => invalidar("gastos"));

    expect(busca.chamadas.map((chamada) => chamada.chave)).toEqual(["gastos", "contas", "gastos"]);
    expect(gastos.result.current).toEqual({ dados: "gastos 1", erro: null, carregando: true });
    await act(async () => busca.chamadas[2].adiada.resolver("gastos 2"));
    expect(gastos.result.current.dados).toBe("gastos 2");
    expect(contas.result.current).toEqual({ dados: "contas 1", erro: null, carregando: false });
  });

  it("invalidar marca o cache de consultas desmontadas para buscar ao montar", async () => {
    const busca = buscaControlada<string>();
    const primeira = renderHook(() => useConsulta("tags", busca.criar("tags")));
    await act(async () => busca.chamadas[0].adiada.resolver("antigas"));
    primeira.unmount();

    invalidar("tags");
    const { result } = renderHook(() => useConsulta("tags", busca.criar("tags")));

    expect(result.current).toEqual({ dados: "antigas", erro: null, carregando: true });
    await act(async () => busca.chamadas[1].adiada.resolver("novas"));
    expect(result.current.dados).toBe("novas");
  });

  it("guarda o erro e conserva os últimos dados", async () => {
    const busca = buscaControlada<string>();
    const { result } = renderHook(() => useConsulta("contas", busca.criar("contas")));
    await act(async () => busca.chamadas[0].adiada.resolver("contas"));

    act(() => invalidar("contas"));
    const falha = new Error("fora do ar");
    await act(async () => busca.chamadas[1].adiada.rejeitar(falha));

    expect(result.current).toEqual({ dados: "contas", erro: falha, carregando: false });
  });

  it("desmontar aborta a busca em andamento", () => {
    const busca = buscaControlada<string>();
    const { unmount } = renderHook(() => useConsulta("contas", busca.criar("contas")));

    unmount();

    expect(busca.chamadas[0].sinal.aborted).toBe(true);
  });

  it("limparCache esquece os dados guardados", async () => {
    const busca = buscaControlada<string>();
    const primeira = renderHook(() => useConsulta("contas", busca.criar("contas")));
    await act(async () => busca.chamadas[0].adiada.resolver("contas"));
    primeira.unmount();

    limparCache();
    const { result } = renderHook(() => useConsulta("contas", busca.criar("contas")));

    expect(result.current).toEqual({ dados: undefined, erro: null, carregando: true });
    expect(busca.chamadas).toHaveLength(2);
  });
});

describe("useMutacao", () => {
  it("expõe pendente durante a execução e devolve o resultado", async () => {
    const pendente = adiada<string>();
    const executar = vi.fn((_entrada: number) => pendente.promessa);
    const { result } = renderHook(() => useMutacao(executar));
    expect(result.current.pendente).toBe(false);

    let resultado: Promise<string | undefined> | undefined;
    act(() => {
      resultado = result.current.executar(1);
    });
    expect(result.current.pendente).toBe(true);

    await act(async () => pendente.resolver("feito"));
    expect(await resultado).toBe("feito");
    expect(result.current).toMatchObject({ pendente: false, erro: null });
    expect(executar).toHaveBeenCalledWith(1);
  });

  it("guarda o erro após a falha e o limpa na próxima execução", async () => {
    const falha = new Error("conflito");
    const executar = vi
      .fn<(entrada: string) => Promise<string>>()
      .mockRejectedValueOnce(falha)
      .mockResolvedValueOnce("ok");
    const { result } = renderHook(() => useMutacao(executar));

    let resultado: string | undefined = "não executou";
    await act(async () => {
      resultado = await result.current.executar("a");
    });
    expect(resultado).toBeUndefined();
    expect(result.current).toMatchObject({ pendente: false, erro: falha });

    await act(async () => {
      resultado = await result.current.executar("b");
    });
    expect(resultado).toBe("ok");
    expect(result.current.erro).toBeNull();
  });

  it("ignora uma segunda execução enquanto a primeira está pendente", async () => {
    const pendente = adiada<string>();
    const executar = vi.fn((_entrada: number) => pendente.promessa);
    const { result } = renderHook(() => useMutacao(executar));

    let segunda: string | undefined = "não executou";
    await act(async () => {
      void result.current.executar(1);
      segunda = await result.current.executar(2);
    });

    expect(segunda).toBeUndefined();
    expect(executar).toHaveBeenCalledTimes(1);
    await act(async () => pendente.resolver("feito"));
    await waitFor(() => expect(result.current.pendente).toBe(false));
  });
});
