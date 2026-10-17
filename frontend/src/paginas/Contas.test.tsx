import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../api/cliente";
import type { Conta } from "../api/tipos";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { MENSAGEM_SEM_CONTAS } from "../componentes/Compositor/CompositorDeGasto";
import { entrarNaSimulacao } from "../simulacao/fetchSimulado";
import { Contas } from "./Contas";

beforeEach(() => {
  entrarNaSimulacao();
});

const NBSP = "\u{a0}";

function navegacao(): Navegacao {
  return { nomeDaPessoa: "Você", tela: "contas", aoIrPara: vi.fn(), aoSair: vi.fn() };
}

async function criar(nome: string, saldo: string): Promise<void> {
  await chamar<Conta>("/contas", { metodo: "POST", corpo: { nome, saldo_inicial: saldo } });
}

describe("Contas", () => {
  it("lista as contas sem seleção e mostra o dinheiro total", async () => {
    await criar("Carteira", "100.00");
    await criar("Nubank", "50.50");
    const { container } = render(<Contas navegacao={navegacao()} />);

    await waitFor(() => expect(screen.getByText("Carteira")).toBeTruthy());
    expect(container.querySelectorAll("[aria-pressed]")).toHaveLength(0);
    await waitFor(() =>
      expect(within(container).getByRole("group", { name: /^Dinheiro total/ }).textContent).toContain(
        `R$${NBSP}150,50`,
      ),
    );
  });

  it("o cartão de crédito aparece na lista com o selo, mas não entra no dinheiro total", async () => {
    await criar("Carteira", "100.00");
    // A sincronização simulada traz a conta corrente do banco (R$ 1.500,00) e o cartão Visa Gold (−R$ 820,00).
    await chamar("/sincronizacoes", { metodo: "POST" });
    const { container } = render(<Contas navegacao={navegacao()} />);

    await waitFor(() => expect(screen.getByText("Visa Gold")).toBeTruthy());
    expect(container.querySelector('[data-selo="cartao"]')?.textContent).toBe("Cartão de crédito");
    // 100,00 + 1.500,00; com o cartão seria 780,00.
    await waitFor(() =>
      expect(within(container).getByRole("group", { name: /^Dinheiro total/ }).textContent).toContain(
        `R$${NBSP}1.600,00`,
      ),
    );
  });

  it("sem contas, o estado vazio tem a ação Nova conta, que abre o formulário", async () => {
    render(<Contas navegacao={navegacao()} />);

    await screen.findByText("Nenhuma conta ainda. Crie a primeira.");
    fireEvent.click(screen.getByRole("button", { name: "Nova conta" }));
    expect(screen.getByRole("form", { name: "Nova conta" })).toBeTruthy();
  });

  it("mostra '—' no dinheiro total enquanto as contas não chegaram", () => {
    const { container } = render(<Contas navegacao={navegacao()} />);

    expect(within(container).getByRole("group", { name: /^Dinheiro total/ }).textContent).toContain("—");
  });

  it("criar uma conta pelo formulário avisa e mostra a conta nova", async () => {
    render(<Contas navegacao={navegacao()} />);

    await screen.findByText("Nenhuma conta ainda. Crie a primeira.");
    fireEvent.click(screen.getByRole("button", { name: /Nova conta/ }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Poupança" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() => expect(screen.getByText("Conta criada.")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Poupança")).toBeTruthy());
  });

  it("com formularioInicialAberto já abre o formulário e avisa por quê", async () => {
    render(<Contas navegacao={navegacao()} formularioInicialAberto />);

    expect(screen.getByRole("form", { name: "Nova conta" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(MENSAGEM_SEM_CONTAS)).toBeTruthy());
  });

  it("sem formularioInicialAberto não mostra o aviso de falta de contas", async () => {
    render(<Contas navegacao={navegacao()} />);

    await screen.findByText("Nenhuma conta ainda. Crie a primeira.");
    expect(screen.queryByText(MENSAGEM_SEM_CONTAS)).toBeNull();
  });
});
