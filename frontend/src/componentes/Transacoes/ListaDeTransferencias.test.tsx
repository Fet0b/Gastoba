import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TransferenciaEntreContas } from "../../api/tipos";
import { ListaDeTransferencias } from "./ListaDeTransferencias";

const CONTAS = [
  { id: "c1", nome: "Corrente", rotulo: "Corrente", apelido: null, nome_no_banco: null, final_do_numero: null, saldo: "100.00", tipo: "corrente", origem: "open_finance", papel: "corrente" },
  { id: "c2", nome: "Corretora", rotulo: "Corretora", apelido: null, nome_no_banco: null, final_do_numero: null, saldo: "300.00", tipo: "corrente", origem: "open_finance", papel: "investimento" },
  { id: "c3", nome: "Poupança", rotulo: "Poupança", apelido: null, nome_no_banco: null, final_do_numero: null, saldo: "50.00", tipo: "corrente", origem: "open_finance", papel: "corrente" },
];

function transferencia(extra: Partial<TransferenciaEntreContas> = {}): TransferenciaEntreContas {
  return {
    id: "t1", conta_origem_id: "c1", conta_destino_id: "c2", valor: "300.00", data: "2026-11-04",
    aporte_liquido: "300.00", papel_origem: "corrente", papel_destino: "investimento",
    transacao_origem_id: "o1", transacao_destino_id: "d1", competencia_provisoria: false, ...extra,
  };
}

function simular(transferencias: TransferenciaEntreContas[]): void {
  vi.stubGlobal("fetch", async (url: RequestInfo | URL) => {
    const caminho = String(url);
    if (caminho.includes("/transferencias-entre-contas")) return new Response(JSON.stringify(transferencias));
    if (caminho.endsWith("/contas")) return new Response(JSON.stringify(CONTAS));
    return new Response("[]");
  });
}

beforeEach(() => {
  simular([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function desenhar(contasSelecionadas: readonly string[] = []) {
  return render(
    <ListaDeTransferencias inicio="2026-11-01" fim="2026-11-30" contasSelecionadas={contasSelecionadas} aoAvisar={vi.fn()} />,
  );
}

describe("ListaDeTransferencias", () => {
  it("lista cada transferência numa tabela: data, contas, valor e o efeito em Liberdade financeira", async () => {
    simular([transferencia()]);
    desenhar();

    const tabela = await screen.findByRole("table", { name: "Transferências entre minhas contas" });
    const colunas = within(tabela).getAllByRole("columnheader").map((c) => c.textContent);
    expect(colunas).toEqual(["Data", "Contas", "Valor", "Liberdade financeira", "Ações"]);
    const linha = within(tabela).getAllByRole("row")[1];
    expect(linha.textContent).toContain("04/11/2026");
    expect(linha.textContent).toContain("Corrente");
    expect(linha.textContent).toContain("Corretora");
    expect(linha.textContent).toContain("R$\u{a0}300,00");
  });

  it("sem transferências mostra o estado vazio com uma frase de valor", async () => {
    desenhar();

    expect(await screen.findByText("Nenhuma transferência neste mês")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("a conta escolhida mostra só as transferências que passam por ela", async () => {
    simular([transferencia(), transferencia({ id: "t2", conta_origem_id: "c3", conta_destino_id: "c1", valor: "10.00" })]);
    desenhar(["c2"]);

    const tabela = await screen.findByRole("table");
    await waitFor(() => expect(within(tabela).getAllByRole("row")).toHaveLength(2));
    expect(tabela.textContent).toContain("Corretora");
    expect(tabela.textContent).not.toContain("Poupança");
  });

  it("competência provisória aparece como selo de atenção e o par que falta vem recolhido", async () => {
    simular([transferencia({ competencia_provisoria: true, transacao_destino_id: null })]);
    desenhar();

    const tabela = await screen.findByRole("table");
    expect(within(tabela).getByText("Competência provisória").closest("[data-badge]")?.getAttribute("data-tom")).toBe("atencao");
    expect(within(tabela).getByText("Completar o par").closest("details")).not.toBeNull();
  });

  it("transferência completa não oferece completar o par", async () => {
    simular([transferencia()]);
    desenhar();

    await screen.findByRole("table");
    expect(screen.queryByText("Completar o par")).toBeNull();
  });

  it("o menu da linha tem um nome por data e o botão de completar fica desabilitado até escolher o par", async () => {
    simular([transferencia({ transacao_destino_id: null })]);
    desenhar();

    await screen.findByRole("table");
    expect(screen.getByRole("button", { name: "Mais ações da transferência de 2026-11-04" })).toBeTruthy();
    fireEvent.click(screen.getByText("Completar o par"));
    expect((screen.getByRole("button", { name: "Completar par" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
