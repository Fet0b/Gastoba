import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { usePeriodoDaRota, useRota } from "./useRota";

function irAoEndereco(endereco: string): void {
  window.history.replaceState(null, "", endereco);
}

describe("useRota", () => {
  it("lê a tela do endereço", () => {
    irAoEndereco("/orcamento?mes=2026-10");
    const { result } = renderHook(() => useRota());
    expect(result.current.rota.tela).toBe("orcamento");
    expect(result.current.rota.mes).toEqual({ ano: 2026, mes: 10 });
  });

  it("reescreve a raiz para /inicio sem criar entrada no histórico", () => {
    irAoEndereco("/");
    const tamanho = window.history.length;
    const { result } = renderHook(() => useRota());
    expect(window.location.pathname).toBe("/inicio");
    expect(result.current.rota.tela).toBe("inicio");
    expect(window.history.length).toBe(tamanho);
  });

  it("irPara troca de tela com pushState e leva o mês às telas mensais", () => {
    irAoEndereco("/orcamento?mes=2026-10");
    const { result } = renderHook(() => useRota());
    act(() => result.current.irPara("tags"));
    expect(window.location.pathname + window.location.search).toBe("/tags?mes=2026-10");
    expect(result.current.rota.tela).toBe("tags");
    act(() => result.current.irPara("contas"));
    expect(window.location.pathname + window.location.search).toBe("/contas");
    act(() => result.current.irPara("inicio"));
    expect(window.location.pathname + window.location.search).toBe("/inicio");
  });

  it("o voltar do navegador troca de tela", () => {
    irAoEndereco("/inicio");
    const { result } = renderHook(() => useRota());
    act(() => result.current.irPara("contas"));
    act(() => {
      window.history.back();
    });
    return new Promise<void>((resolver) => {
      setTimeout(() => {
        expect(result.current.rota.tela).toBe("inicio");
        resolver();
      }, 50);
    });
  });
});

describe("usePeriodoDaRota", () => {
  it("vale o mês atual sem o parâmetro e muda o ?mes= com pushState", () => {
    irAoEndereco("/tags");
    const { result } = renderHook(() => usePeriodoDaRota());
    const [periodo, definir] = result.current;
    expect(periodo.mes).toBeGreaterThanOrEqual(1);
    act(() => definir({ ano: 2026, mes: 3 }));
    expect(window.location.search).toBe("?mes=2026-03");
    expect(result.current[0]).toEqual({ ano: 2026, mes: 3 });
  });

  it("não empilha o mesmo mês duas vezes", () => {
    irAoEndereco("/tags?mes=2026-03");
    const { result } = renderHook(() => usePeriodoDaRota());
    const tamanho = window.history.length;
    act(() => result.current[1]({ ano: 2026, mes: 3 }));
    expect(window.history.length).toBe(tamanho);
  });
});
