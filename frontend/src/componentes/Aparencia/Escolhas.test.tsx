import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { OpcoesDeAparencia } from "../../api/tipos";
import { EscolhaDaCor } from "./EscolhaDaCor";
import { EscolhaDaIntensidade } from "./EscolhaDaIntensidade";
import { EscolhaDaMarca } from "./EscolhaDaMarca";
import { EscolhaDaTextura } from "./EscolhaDaTextura";

const OPCOES: OpcoesDeAparencia = {
  intensidades: [
    { codigo: "suave", nome: "Suave" },
    { codigo: "media", nome: "Média" },
    { codigo: "viva", nome: "Viva" },
  ],
  texturas: [
    { codigo: "nenhuma", nome: "Nenhuma" },
    { codigo: "pontos", nome: "Pontos" },
    { codigo: "linhas", nome: "Linhas" },
    { codigo: "grade", nome: "Grade" },
    { codigo: "grao", nome: "Grão" },
  ],
  marcas: [
    { codigo: "olho", nome: "Olho" },
    { codigo: "inicial", nome: "Inicial do nome" },
    { codigo: "moeda", nome: "Moeda" },
    { codigo: "cofre", nome: "Cofre" },
    { codigo: "folha", nome: "Folha" },
    { codigo: "grafico", nome: "Gráfico" },
  ],
};

describe("EscolhaDaCor", () => {
  it("tem oito cores prontas com nome e escolher uma entrega a matiz", () => {
    const mudar = vi.fn();
    render(<EscolhaDaCor matiz={258} aoMudar={mudar} />);
    expect(screen.getAllByRole("radio")).toHaveLength(8);
    expect((screen.getByRole("radio", { name: "Roxo" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Verde" }));
    expect(mudar).toHaveBeenCalledWith(150);
  });

  it("a barra do espectro cobre de 0 a 359 e entrega o número inteiro", () => {
    const mudar = vi.fn();
    render(<EscolhaDaCor matiz={80} aoMudar={mudar} />);
    const barra = screen.getByRole("slider", { name: "Ajuste fino da cor" }) as HTMLInputElement;
    expect([barra.min, barra.max]).toEqual(["0", "359"]);
    expect(barra.getAttribute("aria-valuetext")).toContain("80 graus");
    fireEvent.change(barra, { target: { value: "200" } });
    expect(mudar).toHaveBeenCalledWith(200);
    expect(document.body.textContent).toContain("Cor escolhida: Lima (80 graus).");
  });

  it("avisa em texto quando a cor está a menos de 20 graus de uma cor semântica", () => {
    const { rerender } = render(<EscolhaDaCor matiz={258} aoMudar={vi.fn()} />);
    expect(document.body.textContent).not.toContain("significado fixo");
    rerender(<EscolhaDaCor matiz={140} aoMudar={vi.fn()} />);
    expect(document.body.textContent).toContain("se parece com uma cor de significado fixo");
    expect(document.body.textContent).toContain("verde");
  });
});

describe("EscolhaDaIntensidade, EscolhaDaTextura e EscolhaDaMarca", () => {
  it("intensidade: três opções, a escolhida marcada", () => {
    const mudar = vi.fn();
    render(<EscolhaDaIntensidade opcoes={OPCOES.intensidades} valor="media" aoMudar={mudar} />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    fireEvent.click(screen.getByRole("radio", { name: "Viva" }));
    expect(mudar).toHaveBeenCalledWith("viva");
  });

  it("textura: cinco opções com nome, amostra decorativa e escolha entregue", () => {
    const mudar = vi.fn();
    const { container } = render(<EscolhaDaTextura opcoes={OPCOES.texturas} valor="nenhuma" aoMudar={mudar} />);
    expect(screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).value)).toEqual([
      "nenhuma",
      "pontos",
      "linhas",
      "grade",
      "grao",
    ]);
    expect(container.querySelectorAll("[aria-hidden='true']").length).toBeGreaterThanOrEqual(5);
    fireEvent.click(screen.getByRole("radio", { name: "Grade" }));
    expect(mudar).toHaveBeenCalledWith("grade");
  });

  it("marca: seis opções e a inicial usa a letra do nome digitado", () => {
    const mudar = vi.fn();
    const { container } = render(
      <EscolhaDaMarca opcoes={OPCOES.marcas} valor="olho" nomeDoApp="Zeta" aoMudar={mudar} />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(6);
    expect(container.querySelector("[data-marca='inicial']")?.textContent).toBe("Z");
    fireEvent.click(screen.getByRole("radio", { name: "Folha" }));
    expect(mudar).toHaveBeenCalledWith("folha");
  });
});
