import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { ResumoDaRevisaoDaBolsa } from "./ResumoDaRevisaoDaBolsa";

beforeEach(() => entrarNaSimulacao());

it("não consulta nem aparece sem a importação bancária", () => {
  const fetch = vi.fn(async () => new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  const { container } = render(<ResumoDaRevisaoDaBolsa habilitada={false} aoAvisar={vi.fn()} />);
  expect(container.textContent).toBe("");
  expect(fetch).not.toHaveBeenCalled();
});

it("aparece com proposta, explica em uma frase e tem um botão secundário 'Revisar'", async () => {
  render(<ResumoDaRevisaoDaBolsa habilitada aoAvisar={vi.fn()} />);
  const botao = await screen.findByRole("button", { name: "Revisar" });
  expect(botao.getAttribute("data-variante")).toBe("secundario");
  expect(screen.getByText(/já aparecem em Investimentos/)).toBeTruthy();
  expect(screen.getByText(/para não contar o mesmo dinheiro duas vezes/)).toBeTruthy();
});

it("some quando não há proposta nem item sem par", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ propostas: [], sem_par: [], confirmados: [{ id: "a", operacao_ids: ["x"], vinculos: [], sem_aporte: false }] }), { status: 200 })));
  const { container } = render(<ResumoDaRevisaoDaBolsa habilitada aoAvisar={vi.fn()} />);
  await waitFor(() => expect(container.textContent).toBe(""));
});

it("abre o diálogo e devolve o foco ao botão ao fechar", async () => {
  render(<ResumoDaRevisaoDaBolsa habilitada aoAvisar={vi.fn()} />);
  const botao = await screen.findByRole("button", { name: "Revisar" });
  botao.focus();
  fireEvent.click(botao);
  const dialogo = await screen.findByRole("dialog", { name: "Revisão da bolsa" });
  expect(dialogo).toBeTruthy();
  fireEvent.click(await screen.findByRole("button", { name: "Concluir" }));
  await waitFor(() => expect(document.activeElement).toBe(botao));
});

const semItens = (sem_par: unknown[]) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ propostas: [], sem_par, confirmados: [] }), { status: 200 })));
const item = (extra: object) => ({ motivo: "m", operacao_id: null, transacao_id: null, descricao: "d", data: "2026-10-21", valor: "1.00", ...extra });

it("operação sem lançamento é só informação: o cartão não aparece", async () => {
  semItens([item({ operacao_id: "op", descricao: "Compra de AUVP11 (3)" })]);
  const { container } = render(<ResumoDaRevisaoDaBolsa habilitada aoAvisar={vi.fn()} />);
  await waitFor(() => expect(container.textContent).toBe(""));
});

it("lançamento sem operação ainda pede atenção", async () => {
  semItens([item({ transacao_id: "t", descricao: "LIQ BOLSA - VISTA BRUTO" })]);
  render(<ResumoDaRevisaoDaBolsa habilitada aoAvisar={vi.fn()} />);
  expect(await screen.findByRole("button", { name: "Revisar" })).toBeTruthy();
  expect(screen.getByText(/lançamentos da conta sem operação correspondente/)).toBeTruthy();
});
