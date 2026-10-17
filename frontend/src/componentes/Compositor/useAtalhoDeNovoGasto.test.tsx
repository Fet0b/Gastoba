import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useAtalhoDeNovoGasto } from "./useAtalhoDeNovoGasto";

function ComAtalho({ aoAcionar, ativo = true }: { aoAcionar: () => void; ativo?: boolean }) {
  useAtalhoDeNovoGasto(aoAcionar, ativo);
  return (
    <>
      <button type="button">Botão</button>
      <input aria-label="Campo" />
      <textarea aria-label="Texto" />
      <select aria-label="Escolha">
        <option>a</option>
      </select>
      <div contentEditable aria-label="Editável" suppressContentEditableWarning>
        x
      </div>
    </>
  );
}

describe("useAtalhoDeNovoGasto", () => {
  it.each(["n", "N"])("a tecla %s fora de campos aciona", (key) => {
    const aoAcionar = vi.fn();
    render(<ComAtalho aoAcionar={aoAcionar} />);
    const naoImpedido = fireEvent.keyDown(window, { key });
    expect(aoAcionar).toHaveBeenCalledTimes(1);
    // O "n" não chega ao campo que recebe o foco ao abrir.
    expect(naoImpedido).toBe(false);
  });

  it("também vale com o foco num botão", () => {
    const aoAcionar = vi.fn();
    render(<ComAtalho aoAcionar={aoAcionar} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Botão" }), { key: "n" });
    expect(aoAcionar).toHaveBeenCalledTimes(1);
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }])(
    "ignora com modificador %o",
    (modificador) => {
      const aoAcionar = vi.fn();
      render(<ComAtalho aoAcionar={aoAcionar} />);
      fireEvent.keyDown(window, { key: "n", ...modificador });
      expect(aoAcionar).not.toHaveBeenCalled();
    },
  );

  it.each(["Campo", "Texto", "Escolha", "Editável"])("ignora com o foco em %s", (rotulo) => {
    const aoAcionar = vi.fn();
    render(<ComAtalho aoAcionar={aoAcionar} />);
    fireEvent.keyDown(screen.getByLabelText(rotulo), { key: "n" });
    expect(aoAcionar).not.toHaveBeenCalled();
  });

  it("ignora tecla repetida, outras teclas e o atalho inativo (diálogo aberto)", () => {
    const aoAcionar = vi.fn();
    const { rerender } = render(<ComAtalho aoAcionar={aoAcionar} />);
    fireEvent.keyDown(window, { key: "n", repeat: true });
    fireEvent.keyDown(window, { key: "m" });
    rerender(<ComAtalho aoAcionar={aoAcionar} ativo={false} />);
    fireEvent.keyDown(window, { key: "n" });
    expect(aoAcionar).not.toHaveBeenCalled();
  });

  it("ignora com qualquer diálogo aberto (como a folha Mais)", () => {
    const aoAcionar = vi.fn();
    render(<ComAtalho aoAcionar={aoAcionar} />);
    const dialogo = document.createElement("dialog");
    dialogo.setAttribute("open", "");
    const botao = document.createElement("button");
    dialogo.appendChild(botao);
    document.body.appendChild(dialogo);
    fireEvent.keyDown(botao, { key: "n" });
    expect(aoAcionar).not.toHaveBeenCalled();
    dialogo.remove();
    fireEvent.keyDown(window, { key: "n" });
    expect(aoAcionar).toHaveBeenCalledTimes(1);
  });

  it("para de ouvir ao desmontar", () => {
    const aoAcionar = vi.fn();
    const { unmount } = render(<ComAtalho aoAcionar={aoAcionar} />);
    unmount();
    fireEvent.keyDown(window, { key: "n" });
    expect(aoAcionar).not.toHaveBeenCalled();
  });

  it("usa a função mais recente sem reinstalar o ouvinte", () => {
    const primeira = vi.fn();
    const segunda = vi.fn();
    const { rerender } = render(<ComAtalho aoAcionar={primeira} />);
    rerender(<ComAtalho aoAcionar={segunda} />);
    fireEvent.keyDown(window, { key: "n" });
    expect(primeira).not.toHaveBeenCalled();
    expect(segunda).toHaveBeenCalledTimes(1);
  });
});
