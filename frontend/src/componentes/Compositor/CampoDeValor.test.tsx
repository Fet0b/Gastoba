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
