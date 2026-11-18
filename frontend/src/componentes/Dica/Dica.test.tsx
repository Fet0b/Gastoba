import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Dica } from "./Dica";

function montar(id?: string) {
  render(
    <Dica assunto="a renda-base" id={id}>
      Previsão usada só nos limites.
    </Dica>,
  );
  const botao = screen.getByRole("button", { name: "Sobre a renda-base" });
  const texto = document.getElementById(botao.getAttribute("aria-describedby") as string) as HTMLElement;
  return { botao, texto };
}

describe("Dica", () => {
  it("começa fechada, com o texto no DOM oculto e ligado ao botão", () => {
    const { botao, texto } = montar();

    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(botao.getAttribute("aria-controls")).toBe(texto.id);
    expect(texto.hidden).toBe(true);
    expect(texto.textContent).toBe("Previsão usada só nos limites.");
  });

  it("o clique abre e outro clique fecha", () => {
    const { botao, texto } = montar();

    fireEvent.click(botao);
    expect(texto.hidden).toBe(false);
    expect(botao.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(botao);
    expect(texto.hidden).toBe(true);
    expect(botao.getAttribute("aria-expanded")).toBe("false");
  });

  it("Esc com o foco no botão fecha", () => {
    const { botao, texto } = montar();
    fireEvent.click(botao);

    fireEvent.keyDown(botao, { key: "Escape" });

    expect(texto.hidden).toBe(true);
  });

  it("perder o foco fecha", () => {
    const { botao, texto } = montar();
    fireEvent.click(botao);

    fireEvent.blur(botao);

    expect(texto.hidden).toBe(true);
  });

  it("o mouse abre no pointerenter e fecha no pointerleave", () => {
    const { botao, texto } = montar();

    fireEvent.pointerEnter(botao, { pointerType: "mouse" });
    expect(texto.hidden).toBe(false);

    fireEvent.pointerLeave(botao, { pointerType: "mouse" });
    expect(texto.hidden).toBe(true);
  });

  it("o toque não abre no pointerenter", () => {
    const { botao, texto } = montar();

    fireEvent.pointerEnter(botao, { pointerType: "touch" });

    expect(texto.hidden).toBe(true);
  });

  it("a prop id define o id do texto", () => {
    const { texto } = montar("explicacao");

    expect(texto.id).toBe("explicacao");
  });
});
