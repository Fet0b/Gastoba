import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Navegacao } from "../componentes/Navegacao/telas";
import { formatar } from "../dinheiro/dinheiro";
import { prepararCenarioDeFaturas } from "../simulacao/manipuladores";
import { Faturas } from "./Faturas";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 5, 12, 0, 0));
  prepararCenarioDeFaturas();
});

afterEach(() => {
  vi.useRealTimers();
});

function navegacao(extra: Partial<Navegacao> = {}): Navegacao {
  return {
    nomeDaPessoa: "Você",
    importacaoBancaria: true,
    tela: "faturas",
    aoIrPara: vi.fn(),
    aoSair: vi.fn(),
    ...extra,
  };
}

describe("Faturas", () => {
  it("tem um só h1 e o título da tela, com o subtítulo logo depois", () => {
    const { container } = render(<Faturas navegacao={navegacao()} />);

    expect(container.ownerDocument.querySelectorAll("h1")).toHaveLength(1);
    const titulo = screen.getByRole("heading", { level: 2, name: "Faturas" });
    expect(titulo.closest("header")?.querySelector("p")?.textContent).toBe("O que você deve em cada cartão.");
  });

  it("mostra um bloco por cartão, com o valor devido", async () => {
    const { container } = render(<Faturas navegacao={navegacao()} />);

    expect(await screen.findByRole("heading", { level: 3, name: "FREE VISA" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Cartão Roxo" })).toBeTruthy();
    expect(container.textContent).toContain(`Valor devido hoje: ${formatar("122.18")}`);
  });

  it("mostra a fatura aberta do cartão com total, vencimento, situação e as compras", async () => {
    render(<Faturas navegacao={navegacao()} />);

    const cartao = await screen.findByRole("region", { name: "Faturas do cartão FREE VISA" });
    expect(await screen.findByText("Anthropic Claude")).toBeTruthy();
    expect(cartao.textContent).toContain(formatar("122.18"));
    expect(cartao.textContent).toContain("22/11/2026");
    expect(cartao.querySelector("[data-badge]")?.textContent).toBe("Aberta");
    expect(cartao.textContent).toContain(formatar("118.05"));
    expect(cartao.textContent).toContain(formatar("4.13"));
  });

  it("o aviso de datas estimadas aparece na aberta mesmo com as fechadas vindas do banco", async () => {
    render(<Faturas navegacao={navegacao()} />);

    const cartao = await screen.findByRole("region", { name: "Faturas do cartão FREE VISA" });
    const avisos = cartao.querySelectorAll('[data-aviso="estimativa"]');
    expect(avisos).toHaveLength(1);
    expect(cartao.querySelector("article")?.contains(avisos[0])).toBe(true);
  });

  it("as anteriores ficam recolhidas, da mais recente à mais antiga, e abrem sob demanda", async () => {
    render(<Faturas navegacao={navegacao()} />);
    const cartao = await screen.findByRole("region", { name: "Faturas do cartão FREE VISA" });
    expect(cartao.querySelectorAll("article")).toHaveLength(1);

    const anteriores = cartao.querySelector('button[aria-expanded="false"]') as HTMLElement;
    expect(anteriores.textContent).toBe("Faturas anteriores");
    fireEvent.click(anteriores);
    expect(cartao.querySelectorAll("article")).toHaveLength(2);
    const paga = cartao.querySelectorAll("article")[1];
    expect(paga.querySelector("[data-badge]")?.textContent).toBe("Paga");
    expect(screen.queryByText("Curso online")).toBeNull();

    const abrir = screen.getAllByRole("button", { name: /^Ver compras/ })[0];
    expect(abrir.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(abrir);
    expect(await screen.findByText("Curso online")).toBeTruthy();
    expect(abrir.getAttribute("aria-expanded")).toBe("true");
    expect(paga.textContent).toContain("Parcela 2/10");
    expect(paga.textContent).toContain(formatar("-10.00"));
    expect(paga.textContent).toContain("Pagamento em 20/10/2026");
  });

  it("a vencida e a paga aparecem com a situação em texto", async () => {
    render(<Faturas navegacao={navegacao()} />);
    const roxo = await screen.findByRole("region", { name: "Faturas do cartão Cartão Roxo" });
    fireEvent.click(roxo.querySelector('button[aria-expanded="false"]') as HTMLElement);
    expect(roxo.querySelectorAll("article")[1].querySelector("[data-badge]")?.textContent).toBe("Vencida");
  });

  it("sem a importação mostra o estado vazio com 'Ver contas' e não chama a API", async () => {
    const nav = navegacao({ importacaoBancaria: false });
    const espiao = vi.spyOn(globalThis, "fetch");
    render(<Faturas navegacao={nav} />);
    await Promise.resolve();

    expect(screen.getByText("Nenhum cartão de crédito conectado")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver contas" }));
    expect(nav.aoIrPara).toHaveBeenCalledWith("contas");
    expect(espiao).not.toHaveBeenCalled();
    espiao.mockRestore();
  });

  it("com a importação mas sem cartão mostra o mesmo estado vazio", async () => {
    const { reiniciarSimulacao, entrarNaSimulacao } = await import("../simulacao/fetchSimulado");
    reiniciarSimulacao();
    entrarNaSimulacao();
    render(<Faturas navegacao={navegacao()} />);

    expect(await screen.findByText("Nenhum cartão de crédito conectado")).toBeTruthy();
  });

  it("um erro da API aparece junto à lista", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ erro: { codigo: "importacao_desligada", mensagem: "A importação bancária não está disponível." } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    ) as typeof fetch;
    render(<Faturas navegacao={navegacao()} />);

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("A importação bancária não está disponível."),
    );
    globalThis.fetch = original;
  });
});
