import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DURACAO_DO_SINAL_DO_OLHO, useEstadoDoOlho } from "./useEstadoDoOlho";

afterEach(() => {
  vi.useRealTimers();
});

describe("useEstadoDoOlho", () => {
  it("começa em normal", () => {
    const { result } = renderHook(() => useEstadoDoOlho());

    expect(result.current[0]).toBe("normal");
  });

  it("volta a normal depois da animação, para o próximo sinal animar de novo", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEstadoDoOlho());

    act(() => result.current[1]("confirmando"));
    expect(result.current[0]).toBe("confirmando");

    act(() => vi.advanceTimersByTime(DURACAO_DO_SINAL_DO_OLHO - 1));
    expect(result.current[0]).toBe("confirmando");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current[0]).toBe("normal");

    // Dois gastos seguidos: o segundo também troca o data-estado (e gira).
    act(() => result.current[1]("confirmando"));
    expect(result.current[0]).toBe("confirmando");
  });

  it("um sinal diferente no meio troca o estado e recomeça o prazo", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEstadoDoOlho());

    act(() => result.current[1]("confirmando"));
    act(() => vi.advanceTimersByTime(DURACAO_DO_SINAL_DO_OLHO - 100));
    act(() => result.current[1]("erro"));
    expect(result.current[0]).toBe("erro");

    act(() => vi.advanceTimersByTime(DURACAO_DO_SINAL_DO_OLHO - 1));
    expect(result.current[0]).toBe("erro");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current[0]).toBe("normal");
  });

  it("desmontar cancela o temporizador", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useEstadoDoOlho());

    act(() => result.current[1]("erro"));
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
