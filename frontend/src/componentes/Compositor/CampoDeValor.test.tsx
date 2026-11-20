import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { CampoDeValor } from "./CampoDeValor";

/** Guarda o valor (string decimal da API) e o mostra fora do campo. */
function ComValor({ inicial = "0.00", erro }: { inicial?: string; erro?: string }) {
  const [valor, definirValor] = useState(inicial);
  return (
    <>
      <CampoDeValor rotulo="Valor" valor={valor} aoMudar={definirValor} erro={erro} />
      <output data-testid="decimal">{valor}</output>
    </>
  );
}

function campo(): HTMLInputElement {
  return screen.getByLabelText("Valor") as HTMLInputElement;
}

function decimal(): string {
  return screen.getByTestId("decimal").textContent ?? "";
}

function digitar(texto: string): void {
  fireEvent.change(campo(), { target: { value: texto } });
}

describe("CampoDeValor", () => {
  it("é um campo numérico rotulado que começa em 0,00", () => {
    render(<ComValor />);
    expect(campo().value).toBe("0,00");
    expect(campo().getAttribute("inputmode")).toBe("numeric");
  });

  it.each([
    ["0", "0,00", "0.00"],
    ["5", "0,05", "0.05"],
    ["2590", "25,90", "25.90"],
    ["123456", "1.234,56", "1234.56"],
  ])("lê os dígitos %s como centavos: %s", (digitos, mascara, valor) => {
    render(<ComValor />);
    digitar(digitos);
    expect(campo().value).toBe(mascara);
    expect(decimal()).toBe(valor);
  });

  it("acrescenta o dígito digitado no fim", () => {
    render(<ComValor inicial="25.90" />);
    expect(campo().value).toBe("25,90");
    digitar("25,901");
    expect(campo().value).toBe("259,01");
    expect(decimal()).toBe("259.01");
  });

  it("Backspace remove o último dígito", () => {
    render(<ComValor inicial="25.90" />);
    const naoImpedido = fireEvent.keyDown(campo(), { key: "Backspace" });
    expect(naoImpedido).toBe(false);
    expect(campo().value).toBe("2,59");
    fireEvent.keyDown(campo(), { key: "Backspace" });
    fireEvent.keyDown(campo(), { key: "Backspace" });
    fireEvent.keyDown(campo(), { key: "Backspace" });
    expect(campo().value).toBe("0,00");
    fireEvent.keyDown(campo(), { key: "Backspace" });
    expect(decimal()).toBe("0.00");
  });

  it("Backspace com tudo selecionado zera o valor", () => {
    render(<ComValor inicial="25.90" />);
    campo().setSelectionRange(0, campo().value.length);
    fireEvent.keyDown(campo(), { key: "Backspace" });
    expect(campo().value).toBe("0,00");
  });

  it("colar ignora o que não é dígito", () => {
    render(<ComValor />);
    digitar("R$ 25,90");
    expect(campo().value).toBe("25,90");
    expect(decimal()).toBe("25.90");
  });

  it("recusa o dígito que passaria do limite", () => {
    render(<ComValor inicial="1000000000000.00" />);
    expect(campo().value).toBe("1.000.000.000.000,00");
    digitar("1.000.000.000.000,001");
    expect(campo().value).toBe("1.000.000.000.000,00");
    expect(decimal()).toBe("1000000000000.00");
  });

  it("liga a mensagem de erro ao campo", () => {
    render(<ComValor erro="O valor deve ser positivo." />);
    expect(campo().getAttribute("aria-invalid")).toBe("true");
    const id = campo().getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(id)?.textContent).toBe("O valor deve ser positivo.");
  });

  it("sem erro não marca o campo", () => {
    render(<ComValor />);
    expect(campo().hasAttribute("aria-invalid")).toBe(false);
    expect(campo().hasAttribute("aria-describedby")).toBe(false);
  });
});

/** Simula o que o navegador entrega quando o cursor não está no fim. */
function editar(texto: string, cursor: number): void {
  const entrada = campo();
  const definir = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  definir?.call(entrada, texto);
  entrada.setSelectionRange(cursor, cursor);
  fireEvent.input(entrada);
}

describe("CampoDeValor com o cursor fora do fim (U28)", () => {
  it("clique no início de 0,00: digitar 4590 dá 45,90", () => {
    render(<ComValor />);
    // O navegador insere cada dígito na posição do cursor, que fica logo depois dele.
    editar("40,00", 1);
    expect(campo().value).toBe("0,04");
    editar("50,04", 1);
    expect(campo().value).toBe("0,45");
    editar("90,45", 1);
    expect(campo().value).toBe("4,59");
    editar("04,59", 1);
    expect(campo().value).toBe("45,90");
    expect(decimal()).toBe("45.90");
  });

  it("cursor no meio: o dígito entra como o último", () => {
    render(<ComValor inicial="12.34" />);
    editar("125,34", 2);
    expect(campo().value).toBe("123,45");
    expect(decimal()).toBe("123.45");
  });

  it("dígito inserido no início de um valor existente entra pela direita", () => {
    render(<ComValor inicial="12.34" />);
    editar("912,34", 1);
    expect(decimal()).toBe("123.49");
  });

  it("colar com o cursor no início entra como últimos dígitos", () => {
    render(<ComValor inicial="12.34" />);
    editar("R$ 5,6712,34", 7);
    expect(decimal()).toBe("12345.67");
  });

  it("seleção total seguida de dígito substitui o valor", () => {
    render(<ComValor inicial="12.34" />);
    editar("7", 1);
    expect(decimal()).toBe("0.07");
  });

  it("apagar com o teclado virtual (sem tecla Backspace) tira o último dígito", () => {
    render(<ComValor inicial="12.34" />);
    editar("1,34", 1);
    expect(decimal()).toBe("1.23");
  });

  it("o limite do backend continua recusando o dígito excedente fora do fim", () => {
    render(<ComValor inicial="1000000000000.00" />);
    editar("91.000.000.000.000,00", 1);
    expect(decimal()).toBe("1000000000000.00");
  });
});
