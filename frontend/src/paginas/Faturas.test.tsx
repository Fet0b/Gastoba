import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../api/cliente";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { entrarNaSimulacao } from "../simulacao/fetchSimulado";
import { Faturas } from "./Faturas";

beforeEach(() => {
  entrarNaSimulacao();
});

function navegacao(): Navegacao {
  return { nomeDaPessoa: "Você", tela: "faturas", aoIrPara: vi.fn(), aoSair: vi.fn() };
}

describe("Faturas", () => {
  it("mostra o aviso de que chega em breve e o cartão marcado como exemplo", () => {
    render(<Faturas navegacao={navegacao()} />);

    expect(screen.getByText("Faturas chega em breve")).toBeTruthy();
    expect(screen.getByText("Exemplo")).toBeTruthy();
    expect(screen.getByText("Gasto")).toBeTruthy();
    expect(screen.getByText("Limite")).toBeTruthy();
  });

  it("o desenho é marcado como exemplo e o gráfico é só decoração", () => {
    const { container } = render(<Faturas navegacao={navegacao()} />);

    const cartao = screen.getByRole("group", { name: "Exemplo de cartão de fatura" });
    expect(cartao.textContent).toContain("Exemplo");
    expect(cartao.textContent).toContain("R$");
    expect(cartao.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    // Um só h1 (a moldura) e o título da tela.
    expect(container.ownerDocument.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "Faturas" })).not.toBeNull();
    // O estado "em breve" usa o componente-base (ícone decorativo e título).
    expect(screen.getByText("Faturas chega em breve").tagName).toBe("P");
  });

  it("não chama a API e não é afetada pelas contas", async () => {
    await chamar("/contas", { metodo: "POST", corpo: { nome: "Carteira", saldo_inicial: "999.00" } });
    const espiao = vi.spyOn(globalThis, "fetch");
    const { container } = render(<Faturas navegacao={navegacao()} />);
    await new Promise((resolver) => setTimeout(resolver, 20));

    expect(espiao).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("999");
    espiao.mockRestore();
  });
});
