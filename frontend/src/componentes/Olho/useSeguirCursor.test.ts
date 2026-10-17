import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { definirMidia } from "../../testes/preparar";
import { ALCANCE_DO_OLHAR, RAIO_DO_OLHAR, useSeguirCursor } from "./useSeguirCursor";

// O olho fica em (100, 100) com 64×64 px: o centro é (132, 132).
const CENTRO = 132;

function criarOlho(): HTMLElement {
  const elemento = document.createElement("div");
  elemento.getBoundingClientRect = () =>
    ({
      x: 100,
      y: 100,
      left: 100,
      top: 100,
      right: 164,
      bottom: 164,
      width: 64,
      height: 64,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.append(elemento);
  return elemento;
}

function moverCursor(clientX: number, clientY: number): void {
  act(() => {
    window.dispatchEvent(new MouseEvent("pointermove", { clientX, clientY }));
  });
}

function deslocamento(elemento: HTMLElement): { x: number; y: number } {
  return {
    x: parseFloat(elemento.style.getPropertyValue("--olho-x") || "0"),
    y: parseFloat(elemento.style.getPropertyValue("--olho-y") || "0"),
  };
}

let olho: HTMLElement;

beforeEach(() => {
  // requestAnimationFrame síncrono: cada quadro roda na hora.
  vi.stubGlobal("requestAnimationFrame", (quadro: FrameRequestCallback) => {
    quadro(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  olho = criarOlho();
});

afterEach(() => {
  olho.remove();
  vi.unstubAllGlobals();
});

describe("useSeguirCursor", () => {
  it("com o cursor longe, limita o deslocamento ao raio do olhar", () => {
    renderHook(() => useSeguirCursor({ current: olho }));

    moverCursor(CENTRO + 1000, CENTRO);
    expect(deslocamento(olho).x).toBeCloseTo(RAIO_DO_OLHAR, 2);
    expect(deslocamento(olho).y).toBeCloseTo(0, 2);

    moverCursor(CENTRO - 1000, CENTRO - 1000);
    const { x, y } = deslocamento(olho);
    expect(Math.hypot(x, y)).toBeCloseTo(RAIO_DO_OLHAR, 1);
    expect(x).toBeLessThan(0);
    expect(y).toBeLessThan(0);
  });

  it("com o cursor perto, o deslocamento é proporcional à distância", () => {
    renderHook(() => useSeguirCursor({ current: olho }));

    moverCursor(CENTRO, CENTRO + ALCANCE_DO_OLHAR / 4);

    expect(deslocamento(olho).x).toBeCloseTo(0, 2);
    expect(deslocamento(olho).y).toBeCloseTo(RAIO_DO_OLHAR / 4, 2);
  });

  it("volta ao centro quando o cursor sai da janela ou ela perde o foco", () => {
    renderHook(() => useSeguirCursor({ current: olho }));

    moverCursor(CENTRO + 1000, CENTRO);
    act(() => {
      window.dispatchEvent(new MouseEvent("pointerout", { relatedTarget: null }));
    });
    expect(deslocamento(olho)).toEqual({ x: 0, y: 0 });

    moverCursor(CENTRO, CENTRO + 1000);
    act(() => {
      window.dispatchEvent(new FocusEvent("blur"));
    });
    expect(deslocamento(olho)).toEqual({ x: 0, y: 0 });
  });

  it("no toque (sem cursor) o olho fica centrado", () => {
    renderHook(() => useSeguirCursor({ current: olho }));

    act(() => {
      const toque = new MouseEvent("pointermove", { clientX: CENTRO + 1000, clientY: CENTRO });
      Object.defineProperty(toque, "pointerType", { value: "touch" });
      window.dispatchEvent(toque);
    });

    expect(deslocamento(olho)).toEqual({ x: 0, y: 0 });
  });

  it("ao desmontar, para de ouvir o cursor", () => {
    const { unmount } = renderHook(() => useSeguirCursor({ current: olho }));
    moverCursor(CENTRO + 1000, CENTRO);
    const antes = deslocamento(olho);

    unmount();
    moverCursor(CENTRO - 1000, CENTRO);

    expect(deslocamento(olho)).toEqual(antes);
  });

  it("com movimento reduzido não segue, e passa a seguir quando a preferência muda", () => {
    definirMidia(true);
    renderHook(() => useSeguirCursor({ current: olho }));

    moverCursor(CENTRO + 1000, CENTRO);
    expect(deslocamento(olho)).toEqual({ x: 0, y: 0 });

    act(() => definirMidia(false));
    moverCursor(CENTRO + 1000, CENTRO);
    expect(deslocamento(olho).x).toBeCloseTo(RAIO_DO_OLHAR, 2);

    act(() => definirMidia(true));
    expect(deslocamento(olho)).toEqual({ x: 0, y: 0 });
    moverCursor(CENTRO - 1000, CENTRO);
    expect(deslocamento(olho)).toEqual({ x: 0, y: 0 });
  });
});
