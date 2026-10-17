import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { Categoria } from "../../api/tipos";
import { SeletorDeCategoria } from "./SeletorDeCategoria";

const CATEGORIAS: Categoria[] = [
  { codigo: "lazer", nome: "Lazer" },
  { codigo: "conforto", nome: "Conforto" },
  { codigo: "nova", nome: "Nova" },
];

function ComCategoria({ erro }: { erro?: string }) {
  const [valor, definirValor] = useState<string | null>(null);
  return (
    <>
      <SeletorDeCategoria categorias={CATEGORIAS} valor={valor} aoMudar={definirValor} erro={erro} />
      <output data-testid="valor">{valor ?? ""}</output>
    </>
  );
}

function radios(): HTMLInputElement[] {
  return screen.queryAllByRole("radio") as HTMLInputElement[];
}

describe("SeletorDeCategoria", () => {
  it("é um grupo obrigatório rotulado, sem categoria marcada por padrão", () => {
    render(<ComCategoria />);
    const grupo = screen.getByRole("radiogroup", { name: "Categoria" });
    expect(grupo.getAttribute("aria-required")).toBe("true");
    expect(radios().map((radio) => radio.checked)).toEqual([false, false, false]);
  });

  it("mostra cada categoria pelo nome, com o ponto colorido", () => {
    const { container } = render(<ComCategoria />);
    expect(screen.getByLabelText("Lazer")).toBeTruthy();
    const pontos = [...container.querySelectorAll<HTMLElement>("[data-cor]")];
    expect(pontos.map((ponto) => ponto.dataset.cor)).toEqual(["#E879F9", "#FBBF24", "#9A8FB8"]);
    expect(pontos.every((ponto) => ponto.getAttribute("aria-hidden") === "true")).toBe(true);
  });

  it("escolher uma opção devolve o código", () => {
    render(<ComCategoria />);
    fireEvent.click(screen.getByLabelText("Conforto"));
    expect(screen.getByTestId("valor").textContent).toBe("conforto");
    expect((screen.getByLabelText("Conforto") as HTMLInputElement).checked).toBe(true);
  });

  it("enquanto as categorias não chegam, avisa que estão carregando", () => {
    render(<SeletorDeCategoria categorias={undefined} valor={null} aoMudar={() => {}} />);
    expect(radios()).toHaveLength(0);
    expect(screen.getByText("Carregando categorias…")).toBeTruthy();
  });

  it("liga o erro ao grupo", () => {
    render(<ComCategoria erro="Escolha uma categoria válida." />);
    const grupo = screen.getByRole("radiogroup", { name: "Categoria" });
    expect(grupo.getAttribute("aria-invalid")).toBe("true");
    const id = grupo.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(id)?.textContent).toBe("Escolha uma categoria válida.");
  });
});
