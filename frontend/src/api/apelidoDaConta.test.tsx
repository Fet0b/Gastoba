import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { entrarNaSimulacao } from "../simulacao/fetchSimulado";
import { useContas, useCriarConta, useDefinirApelido, useRemoverApelido } from "./consultas";

describe("apelido da conta: hooks", () => {
  it("dar e remover o apelido refaz a lista de contas sem recarregar", async () => {
    entrarNaSimulacao();
    const { result } = renderHook(() => ({
      contas: useContas(),
      criar: useCriarConta(),
      definir: useDefinirApelido(),
      remover: useRemoverApelido(),
    }));
    await waitFor(() => expect(result.current.contas.dados).toBeDefined());
    let id = "";
    await act(async () => {
      id = (await result.current.criar.executar({ nome: "Carteira", saldo_inicial: "0.00" }))?.id ?? "";
    });
    await waitFor(() => expect(result.current.contas.dados?.[0]?.rotulo).toBe("Carteira"));

    await act(async () => {
      await result.current.definir.executar({ id, apelido: "Casa" });
    });
    await waitFor(() => expect(result.current.contas.dados?.[0]?.rotulo).toBe("Casa"));

    await act(async () => {
      await result.current.remover.executar(id);
    });
    await waitFor(() => expect(result.current.contas.dados?.[0]?.rotulo).toBe("Carteira"));
  });
});
