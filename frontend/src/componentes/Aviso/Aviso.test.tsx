import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Aviso, DURACAO_DA_CONFIRMACAO, type MensagemDoAviso } from "./Aviso";

/** Painel mínimo: guarda a mensagem e a apaga quando o Aviso pede. */
function ComAviso({ inicial }: { inicial: MensagemDoAviso | null }) {
  const [mensagem, definirMensagem] = useState(inicial);
  return <Aviso mensagem={mensagem} aoDispensar={() => definirMensagem(null)} />;
}

function regiao(container: HTMLElement): Element {
  const elemento = container.querySelector('[aria-live="polite"]');
  if (!elemento) throw new Error("Região aria-live ausente.");
  return elemento;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Aviso", () => {
  it("a região aria-live fica montada mesmo sem mensagem", () => {
    const { container } = render(<Aviso mensagem={null} aoDispensar={() => {}} />);

    expect(regiao(container).textContent).toBe("");
  });

  it("anuncia a confirmação e ela some sozinha depois de alguns segundos", () => {
    vi.useFakeTimers();
    const { container } = render(
      <ComAviso inicial={{ tipo: "confirmacao", texto: "Gasto registrado." }} />,
    );

    expect(regiao(container).textContent).toContain("Gasto registrado.");
    expect(screen.queryByRole("button", { name: "Dispensar" })).toBeNull();

    act(() => vi.advanceTimersByTime(DURACAO_DA_CONFIRMACAO - 1));
    expect(regiao(container).textContent).toContain("Gasto registrado.");

    act(() => vi.advanceTimersByTime(1));
    expect(regiao(container).textContent).toBe("");
  });

  it("o erro fica até a pessoa clicar em Dispensar", () => {
    vi.useFakeTimers();
    const { container } = render(
      <ComAviso inicial={{ tipo: "erro", texto: "Não foi possível falar com o servidor." }} />,
    );

    act(() => vi.advanceTimersByTime(DURACAO_DA_CONFIRMACAO * 10));
    expect(regiao(container).textContent).toContain("Não foi possível falar com o servidor.");

    fireEvent.click(screen.getByRole("button", { name: "Dispensar" }));
    expect(regiao(container).textContent).toBe("");
    expect(screen.queryByRole("button", { name: "Dispensar" })).toBeNull();
  });

  it("uma confirmação nova reinicia o prazo", () => {
    vi.useFakeTimers();
    const aoDispensar = vi.fn();
    const { rerender } = render(
      <Aviso mensagem={{ tipo: "confirmacao", texto: "Conta criada." }} aoDispensar={aoDispensar} />,
    );

    act(() => vi.advanceTimersByTime(DURACAO_DA_CONFIRMACAO - 100));
    rerender(
      <Aviso mensagem={{ tipo: "confirmacao", texto: "Gasto registrado." }} aoDispensar={aoDispensar} />,
    );
    act(() => vi.advanceTimersByTime(DURACAO_DA_CONFIRMACAO - 100));
    expect(aoDispensar).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(100));
    expect(aoDispensar).toHaveBeenCalledTimes(1);
  });

  it("desmontar antes do prazo cancela o temporizador", () => {
    vi.useFakeTimers();
    const aoDispensar = vi.fn();
    const { unmount } = render(
      <Aviso mensagem={{ tipo: "confirmacao", texto: "Feito." }} aoDispensar={aoDispensar} />,
    );

    unmount();
    vi.advanceTimersByTime(DURACAO_DA_CONFIRMACAO * 2);

    expect(aoDispensar).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uma mensagem nova com o mesmo texto troca o nó anunciado, para ser lida de novo", () => {
    const { container, rerender } = render(
      <Aviso mensagem={{ tipo: "confirmacao", texto: "Gasto registrado." }} aoDispensar={() => {}} />,
    );
    const primeiro = regiao(container).firstElementChild;

    rerender(
      <Aviso mensagem={{ tipo: "confirmacao", texto: "Gasto registrado." }} aoDispensar={() => {}} />,
    );
    const segundo = regiao(container).firstElementChild;

    expect(primeiro).not.toBeNull();
    expect(segundo).not.toBeNull();
    expect(segundo).not.toBe(primeiro);
    expect(regiao(container).textContent).toBe("Gasto registrado.");
  });

  it("o mesmo objeto de mensagem num novo render do pai não é reanunciado", () => {
    const mensagem: MensagemDoAviso = { tipo: "confirmacao", texto: "Conta criada." };
    const { container, rerender } = render(<Aviso mensagem={mensagem} aoDispensar={() => {}} />);
    const primeiro = regiao(container).firstElementChild;

    rerender(<Aviso mensagem={mensagem} aoDispensar={() => {}} />);

    expect(regiao(container).firstElementChild).toBe(primeiro);
  });

  it("marca o tipo da mensagem em data-tipo", () => {
    const { container, rerender } = render(
      <Aviso mensagem={{ tipo: "erro", texto: "Falhou." }} aoDispensar={() => {}} />,
    );
    expect(container.querySelector('[data-tipo="erro"]')).not.toBeNull();

    rerender(<Aviso mensagem={{ tipo: "confirmacao", texto: "Feito." }} aoDispensar={() => {}} />);
    expect(container.querySelector('[data-tipo="confirmacao"]')).not.toBeNull();
  });
});
