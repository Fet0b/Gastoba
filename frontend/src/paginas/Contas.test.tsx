import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../api/cliente";
import type { Conta } from "../api/tipos";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { MENSAGEM_SEM_CONTAS } from "../componentes/Compositor/CompositorDeGasto";
import { entrarNaSimulacao } from "../simulacao/fetchSimulado";
import { prepararCenarioDeFaturas } from "../simulacao/manipuladores";
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
  it("tem cabeçalho com subtítulo, um só h1 e um só h2 'Contas'", async () => {
    await criar("Carteira", "100.00");
    render(<Contas navegacao={navegacao()} />);

    await screen.findByText("Carteira");
    expect(screen.getByText("Seu dinheiro em cada lugar.")).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 2, name: "Contas" })).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Suas contas" })).toBeTruthy();
  });

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

  it("o cartão de crédito mostra a Fatura aberta positiva, sem Saldo negativo", async () => {
    await chamar("/sincronizacoes", { metodo: "POST" });
    const { container } = render(<Contas navegacao={navegacao()} />);

    await waitFor(() => expect(screen.getByText("Visa Gold")).toBeTruthy());
    const cartao = screen.getByText("Visa Gold").closest("[data-tom]") as HTMLElement;
    expect(cartao.textContent).toContain("Fatura aberta");
    expect(cartao.textContent).toContain(`R$${NBSP}820,00`);
    expect(cartao.getAttribute("data-tom")).toBe("neutro");
    expect(container.textContent).not.toContain("Saldo negativo");
  });

  it("sem contas, o estado vazio tem a ação Nova conta, que abre o formulário", async () => {
    render(<Contas navegacao={navegacao()} />);

    await screen.findByText("Nenhuma conta ainda");
    fireEvent.click(screen.getByRole("button", { name: "Nova conta" }));
    expect(screen.getByRole("form", { name: "Nova conta" })).toBeTruthy();
  });

  it("mostra '—' no dinheiro total enquanto as contas não chegaram", () => {
    const { container } = render(<Contas navegacao={navegacao()} />);

    expect(within(container).getByRole("group", { name: /^Dinheiro total/ }).textContent).toContain("—");
  });

  it("criar uma conta pelo formulário avisa e mostra a conta nova", async () => {
    render(<Contas navegacao={navegacao()} />);

    await screen.findByText("Nenhuma conta ainda");
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

    await screen.findByText("Nenhuma conta ainda");
    expect(screen.queryByText(MENSAGEM_SEM_CONTAS)).toBeNull();
  });
});

describe("Contas com a importação bancária: situação dos cartões", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12, 0, 0));
    prepararCenarioDeFaturas();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function comImportacao() {
    return { ...navegacao(), importacaoBancaria: true };
  }

  it("o cartão com fatura aberta diz 'Fatura aberta', sem selo de problema", async () => {
    render(<Contas navegacao={comImportacao()} />);

    await waitFor(() => expect(screen.getByText("FREE VISA")).toBeTruthy());
    const cartao = screen.getByText("FREE VISA").closest("[data-tom]") as HTMLElement;
    await waitFor(() => expect(cartao.textContent).toContain("Fatura aberta"));
    expect(cartao.querySelector('[data-selo="vencida"]')).toBeNull();
    expect(cartao.getAttribute("data-tom")).toBe("neutro");
  });

  it("o cartão com fatura vencida e não paga ganha 'Vencida' em texto", async () => {
    render(<Contas navegacao={comImportacao()} />);

    await waitFor(() => expect(screen.getByText("Cartão Roxo")).toBeTruthy());
    const cartao = screen.getByText("Cartão Roxo").closest("[data-tom]") as HTMLElement;
    await waitFor(() => expect(cartao.querySelector('[data-selo="vencida"]')?.textContent).toBe("Vencida"));
    expect(cartao.textContent).not.toContain("Saldo negativo");
  });

  it("sem a importação não consulta as faturas e o rótulo é 'Fatura aberta'", async () => {
    const espiao = vi.spyOn(globalThis, "fetch");
    render(<Contas navegacao={navegacao()} />);

    await waitFor(() => expect(screen.getByText("Cartão Roxo")).toBeTruthy());
    expect(espiao.mock.calls.some(([entrada]) => String(entrada).includes("/faturas"))).toBe(false);
    espiao.mockRestore();
  });
});
