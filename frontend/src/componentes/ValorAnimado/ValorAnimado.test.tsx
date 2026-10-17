import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatar } from "../../dinheiro/dinheiro";
import { definirMidia } from "../../testes/preparar";
import { ValorAnimado } from "./ValorAnimado";

/** Texto que um leitor de tela lê: tudo menos o que está em aria-hidden. */
function textoAcessivel(elemento: Element): string {
  const copia = elemento.cloneNode(true) as Element;
  for (const escondido of copia.querySelectorAll('[aria-hidden="true"]')) escondido.remove();
  return copia.textContent ?? "";
}

/** Texto que aparece animado na tela (a parte aria-hidden). */
function textoVisivel(elemento: Element): string {
  return elemento.querySelector('[aria-hidden="true"]')?.textContent ?? "";
}

// Quadros de animação controlados pelo teste: cada `rodarQuadro(ms)` executa
// os callbacks pendentes com aquele instante.
let pendentes: Map<number, FrameRequestCallback>;
let proximoId: number;

function rodarQuadro(instante: number): void {
  act(() => {
    const agora = [...pendentes.values()];
    pendentes.clear();
    for (const quadro of agora) quadro(instante);
  });
}

beforeEach(() => {
  pendentes = new Map();
  proximoId = 1;
  vi.stubGlobal("requestAnimationFrame", (quadro: FrameRequestCallback) => {
    const id = proximoId++;
    pendentes.set(id, quadro);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    pendentes.delete(id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ValorAnimado", () => {
  it("o valor final está acessível logo após o render", () => {
    const { container } = render(<ValorAnimado valor="974.1" />);
    const raiz = container.firstElementChild as Element;

    expect(textoAcessivel(raiz)).toBe(formatar("974.1"));
    expect(textoAcessivel(raiz)).toBe("R$\u{a0}974,10");
    expect(textoVisivel(raiz)).toBe("R$\u{a0}974,10");
  });

  it("ao trocar o valor, o texto acessível já é o final e a tela conta até ele", () => {
    const { container, rerender } = render(<ValorAnimado valor="100.00" />);
    const raiz = container.firstElementChild as Element;

    rerender(<ValorAnimado valor="974.10" />);
    expect(textoAcessivel(raiz)).toBe("R$\u{a0}974,10");
    expect(textoVisivel(raiz)).toBe("R$\u{a0}100,00");
    expect(raiz.hasAttribute("data-animando")).toBe(true);

    rodarQuadro(1000); // primeiro quadro: início da contagem
    expect(textoVisivel(raiz)).toBe("R$\u{a0}100,00");

    rodarQuadro(1200); // meio do caminho: entre o inicial e o final
    const meio = textoVisivel(raiz);
    expect(meio).not.toBe("R$\u{a0}100,00");
    expect(meio).not.toBe("R$\u{a0}974,10");
    expect(textoAcessivel(raiz)).toBe("R$\u{a0}974,10");

    rodarQuadro(2000); // passou da duração: chegou ao final
    expect(textoVisivel(raiz)).toBe("R$\u{a0}974,10");
    expect(raiz.hasAttribute("data-animando")).toBe(false);
    expect(pendentes.size).toBe(0);
  });

  it("com movimento reduzido mostra o valor final direto, sem animar", () => {
    definirMidia(true);
    const { container, rerender } = render(<ValorAnimado valor="100.00" />);
    const raiz = container.firstElementChild as Element;

    rerender(<ValorAnimado valor="-10.00" />);

    expect(textoVisivel(raiz)).toBe("−R$\u{a0}10,00");
    expect(textoAcessivel(raiz)).toBe("−R$\u{a0}10,00");
    expect(raiz.hasAttribute("data-animando")).toBe(false);
    expect(pendentes.size).toBe(0);
  });

  it("um valor novo no meio da contagem parte do que está na tela", () => {
    const { container, rerender } = render(<ValorAnimado valor="0.00" />);
    const raiz = container.firstElementChild as Element;

    rerender(<ValorAnimado valor="1000.00" />);
    rodarQuadro(0);
    rodarQuadro(200);
    const meio = textoVisivel(raiz);

    rerender(<ValorAnimado valor="2000.00" />);
    expect(pendentes.size).toBe(1);
    expect(textoAcessivel(raiz)).toBe("R$\u{a0}2.000,00");
    rodarQuadro(500); // primeiro quadro da nova contagem
    expect(textoVisivel(raiz)).toBe(meio);

    rodarQuadro(1000);
    expect(textoVisivel(raiz)).toBe("R$\u{a0}2.000,00");
  });

  it("re-renderizar com o mesmo valor não reprisa a contagem", () => {
    const { container, rerender } = render(<ValorAnimado valor="5.00" />);
    const raiz = container.firstElementChild as Element;

    rerender(<ValorAnimado valor="5.00" className="outra" />);

    expect(pendentes.size).toBe(0);
    expect(raiz.hasAttribute("data-animando")).toBe(false);
  });

  it("desmontar no meio da contagem cancela o quadro pendente", () => {
    const { rerender, unmount } = render(<ValorAnimado valor="1.00" />);
    rerender(<ValorAnimado valor="2.00" />);
    expect(pendentes.size).toBe(1);

    unmount();

    expect(pendentes.size).toBe(0);
  });

  it("aplica a className recebida", () => {
    const { container } = render(<ValorAnimado valor="1.00" className="saldo" />);

    expect(container.firstElementChild?.classList.contains("saldo")).toBe(true);
  });
});
