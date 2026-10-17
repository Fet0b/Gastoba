import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { definirLayoutEstreito } from "../../testes/preparar";
import { Navegacao } from "./Navegacao";
import type { Navegacao as DadosDaNavegacao } from "./telas";

const dados: DadosDaNavegacao = {
  nomeDaPessoa: "Ana",
  tela: "inicio",
  aoIrPara: vi.fn(),
  aoSair: vi.fn(),
};

describe("Navegacao", () => {
  it("usa a barra lateral no computador", () => {
    render(<Navegacao navegacao={dados} estadoDoOlho="normal" />);
    expect(screen.getAllByRole("navigation", { name: "Telas" })).toHaveLength(1);
    expect(screen.getAllByRole("button")).toHaveLength(8);
    expect(screen.queryByRole("button", { name: "Mais" })).toBeNull();
  });

  it("usa a barra de abas no celular", () => {
    definirLayoutEstreito(true);
    render(<Navegacao navegacao={dados} estadoDoOlho="normal" />);
    expect(screen.getAllByRole("navigation", { name: "Telas" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Mais" })).toBeTruthy();
  });

  it("troca de barra quando a largura muda", () => {
    render(<Navegacao navegacao={dados} estadoDoOlho="normal" />);
    act(() => definirLayoutEstreito(true));
    expect(screen.getByRole("button", { name: "Mais" })).toBeTruthy();
    act(() => definirLayoutEstreito(false));
    expect(screen.queryByRole("button", { name: "Mais" })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(8);
  });
});
