import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { prepararCenarioDoGuardado } from "../simulacao/manipuladores";
import { useDefinirGuardadoNasMetas, useGuardadoNasMetas, useProgressoDasMetas } from "./consultas";

describe("guardado nas metas: hooks", () => {
  it("salvar a configuração refaz o progresso das metas sem recarregar (CS-004)", async () => {
    prepararCenarioDoGuardado();
    const { result } = renderHook(() => ({
      progresso: useProgressoDasMetas("2026-11"),
      guardado: useGuardadoNasMetas(),
      salvar: useDefinirGuardadoNasMetas(),
    }));
    await waitFor(() => expect(result.current.progresso.dados).toBeDefined());
    expect(result.current.progresso.dados?.metas[0].guardado).toBe("0.00");

    await act(async () => {
      await result.current.salvar.executar({
        ativo: true,
        marcacoes: [{ categoria: "conforto", tag: "computador" }],
      });
    });

    await waitFor(() => expect(result.current.progresso.dados?.metas[0].guardado).toBe("300.00"));
    await waitFor(() => expect(result.current.guardado.dados?.ativo).toBe(true));
  });
});
