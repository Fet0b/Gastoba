import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { chamar } from "../../api/cliente";
import type { MovimentoDeInvestimento, TransacaoImportada } from "../../api/tipos";
import { entrarNaSimulacao, fetchSimulado } from "../../simulacao/fetchSimulado";
import { adicionarInvestimentoSimulado } from "../../simulacao/manipuladores";
import { AportesEResgates, type PropriedadesDosAportes } from "./AportesEResgates";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 29, 12)); entrarNaSimulacao(); });
afterEach(() => vi.useRealTimers());
const props = (): PropriedadesDosAportes => ({ periodo: { ano: 2026, mes: 10 }, contasSelecionadas: [], navegacao: { nomeDaPessoa: "Você", tela: "transacoes", aoIrPara: vi.fn(), aoSair: vi.fn(), importacaoBancaria: true }, aoAvisar: vi.fn(), aoFalhar: vi.fn(), aoLimparContas: vi.fn() });
async function preparar() {
  const investimento = adicionarInvestimentoSimulado({ nome: "Reserva", tipo: "FIXED_INCOME", saldo: "100.00" });
  await chamar("/sincronizacoes", { metodo: "POST" });
  const caixa = await chamar<TransacaoImportada[]>("/transacoes-importadas");
  const farmacia = caixa.find((t) => t.descricao === "Farmácia")!;
  await chamar(`/transacoes-importadas/${farmacia.id}/aceitar`, { metodo: "POST", corpo: { como_investimento: true } });
  await chamar(`/investimentos/${investimento}/destinacoes`, { metodo: "POST", corpo: { destinacoes: [{ tag: "casa", percentual: 100 }] } });
  const salario = caixa.find((t) => t.descricao === "Salário")!;
  await chamar(`/transacoes-importadas/${salario.id}/aceitar`, { metodo: "POST", corpo: { como_investimento: true } });
  return { investimento, farmacia };
}
it("lista o mês, filtra tipo/investimento e soma centavos exatos sem saldo inicial", async () => {
  const { investimento } = await preparar(); render(<AportesEResgates {...props()} />);
  await screen.findByRole("listitem", { name: "Farmácia" });
  expect(screen.getByLabelText("Total de aportes").textContent).toContain("45,90");
  expect(screen.getByLabelText("Total de resgates").textContent).toContain("5.000,00");
  fireEvent.click(screen.getByRole("button", { name: "Aportes" }));
  expect(screen.queryByRole("listitem", { name: "Salário" })).toBeNull();
  expect(screen.queryByRole("listitem", { name: "Saldo inicial" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Filtrar por investimento"), { target: { value: investimento } });
  expect(screen.getByText("Nenhum movimento com esses filtros.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
  expect(screen.getByRole("listitem", { name: "Saldo inicial" })).toBeTruthy();
});
it("a conta esconde saldo inicial com explicação e limpar também libera a conta", async () => {
  const { farmacia } = await preparar(); const p = { ...props(), contasSelecionadas: [farmacia.conta_id] };
  render(<AportesEResgates {...p} />); await screen.findByRole("listitem", { name: "Farmácia" });
  expect(screen.queryByRole("listitem", { name: "Saldo inicial" })).toBeNull();
  expect(screen.getByText(/Saldo inicial não tem conta/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Saldo inicial" }));
  fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
  expect(p.aoLimparContas).toHaveBeenCalled();
});
it("trocar o mês mantém os filtros de tipo e investimento", async () => {
  const { investimento } = await preparar(); const p = props(); const vista = render(<AportesEResgates {...p} />);
  await screen.findByRole("listitem", { name: "Farmácia" });
  fireEvent.click(screen.getByRole("button", { name: "Saldo inicial" }));
  fireEvent.change(screen.getByLabelText("Filtrar por investimento"), { target: { value: investimento } });
  vista.rerender(<AportesEResgates {...p} periodo={{ ano: 2026, mes: 9 }} />);
  await waitFor(() => expect(screen.queryByRole("listitem", { name: "Saldo inicial" })).toBeNull());
  expect(screen.getByRole("button", { name: "Saldo inicial" }).getAttribute("aria-pressed")).toBe("true");
  expect((screen.getByLabelText("Filtrar por investimento") as HTMLSelectElement).value).toBe(investimento);
});
it("o filtro de investimento é um select agrupado por categoria", async () => {
  await preparar(); render(<AportesEResgates {...props()} />);
  await screen.findByRole("listitem", { name: "Farmácia" });
  const campo = screen.getByLabelText("Filtrar por investimento") as HTMLSelectElement;
  expect(campo.tagName).toBe("SELECT");
  expect(Array.from(campo.options).map((o) => o.textContent)).toEqual(["Todos os investimentos", "Sem investimento", "Reserva"]);
  expect(campo.querySelector('optgroup[label="Renda fixa"]')?.querySelectorAll("option")).toHaveLength(1);
});
it("explica mês vazio, carregamento e erro da API", async () => {
  const p = props(); const vista = render(<AportesEResgates {...p} />);
  expect(screen.getByRole("status", { name: "Carregando movimentos" })).toBeTruthy();
  expect(await screen.findByText(/Nenhum movimento neste mês/)).toBeTruthy(); vista.unmount();
  vi.stubGlobal("fetch", (url: RequestInfo | URL, opcoes?: RequestInit) => String(url).includes("movimentos-de-investimento") ? Promise.resolve(new Response(JSON.stringify({ erro: { codigo: "erro_interno", mensagem: "Não foi possível consultar o exemplo." } }), { status: 500 })) : fetchSimulado(url, opcoes));
  render(<AportesEResgates {...p} periodo={{ ano: 2026, mes: 9 }} />);
  expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível consultar o exemplo.");
  expect(p.aoFalhar).toHaveBeenCalled();
});
it("associa um movimento e desfaz saldo inicial nesta seção sem a caixa", async () => {
  const { investimento } = await preparar(); const p = props(); p.navegacao.importacaoBancaria = false;
  render(<AportesEResgates {...p} />);
  const m = await screen.findByRole("listitem", { name: "Farmácia" });
  expect(within(m).queryByRole("button", { name: /Desfazer classificação/ })).toBeNull();
  fireEvent.click(within(m).getByRole("button", { name: "Associar a um investimento" }));
  fireEvent.change(within(m).getByLabelText("Investimento"), { target: { value: investimento } });
  fireEvent.change(within(m).getByLabelText("Tag da destinação 1"), { target: { value: "casa" } });
  fireEvent.click(within(m).getByRole("button", { name: /Associar: Farmácia/ }));
  await waitFor(() => expect(p.aoAvisar).toHaveBeenCalledWith("Movimento associado ao investimento."));
  await waitFor(() => expect(within(m).queryByRole("button", { name: /Associar: Farmácia/ })).toBeNull());
  const saldo = screen.getByRole("listitem", { name: "Saldo inicial" });
  fireEvent.click(within(saldo).getByRole("button", { name: /^Mais ações de saldo inicial/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Desfazer saldo inicial/ }));
  fireEvent.click(within(saldo).getByRole("button", { name: "Sim, desfazer" }));
  await waitFor(() => expect(p.aoAvisar).toHaveBeenCalledWith("Saldo inicial desfeito."));
  await waitFor(() => expect(screen.queryByRole("listitem", { name: "Saldo inicial" })).toBeNull());
  expect((await chamar<MovimentoDeInvestimento[]>("/movimentos-de-investimento", { parametros: { inicio: "2026-10-01", fim: "2026-10-31" } })).some((m) => m.descricao === "Farmácia")).toBe(true);
});

it("mostra o cartão da Revisão da bolsa no topo, só com a importação bancária", async () => {
  const comImportacao = props();
  comImportacao.navegacao = { ...comImportacao.navegacao, importacaoBancaria: true };
  const { unmount } = render(<AportesEResgates {...comImportacao} />);
  expect(await screen.findByRole("button", { name: "Revisar" })).toBeTruthy();
  unmount();
  const sem = props();
  sem.navegacao = { ...sem.navegacao, importacaoBancaria: false };
  render(<AportesEResgates {...sem} />);
  await screen.findByRole("heading", { name: "Aportes e resgates" });
  expect(screen.queryByRole("button", { name: "Revisar" })).toBeNull();
});

// --- migração para os componentes-base (Art. XI; frente 061, F5) -------------------------------

it("usa Titulo, Seletor e Indicador: título de seção, filtro com rótulo e totais em indicadores", async () => {
  await preparar(); render(<AportesEResgates {...props()} />);
  await screen.findByRole("listitem", { name: "Farmácia" });
  expect(screen.getByRole("heading", { name: "Aportes e resgates" }).getAttribute("data-nivel")).toBe("secao");
  expect(screen.getByLabelText("Filtrar por investimento").closest("[class*=campo]")).toBeTruthy();
  const aportes = screen.getByLabelText("Total de aportes").closest("[data-tom]");
  expect(aportes?.textContent).toContain("Aportes");
  expect(screen.getByLabelText("Total de resgates").closest("[data-tom]")?.textContent).toContain("Resgates");
});

it("mês vazio usa EstadoVazio; com filtro ativo oferece Limpar filtros dentro dele", async () => {
  render(<AportesEResgates {...props()} />);
  const vazio = (await screen.findByText(/Nenhum movimento neste mês/)).closest("[class*=vazio]");
  expect(vazio).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Limpar filtros" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Resgates" }));
  const comFiltro = screen.getByText("Nenhum movimento com esses filtros.").closest("[class*=vazio]");
  expect(comFiltro?.querySelector("button")?.textContent).toBe("Limpar filtros");
});

it("o erro da API tem 'Tentar novamente' e carrega de novo", async () => {
  const p = props();
  vi.stubGlobal("fetch", (url: RequestInfo | URL, opcoes?: RequestInit) => String(url).includes("movimentos-de-investimento") ? Promise.resolve(new Response(JSON.stringify({ erro: { codigo: "erro_interno", mensagem: "Falhou." } }), { status: 500 })) : fetchSimulado(url, opcoes));
  render(<AportesEResgates {...p} />);
  const alerta = await screen.findByRole("alert");
  expect(within(alerta).getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
});

it("os saldos iniciais ficam num Recolhivel 'Saldos iniciais (N)' fechado, no fim da lista", async () => {
  await preparar(); render(<AportesEResgates {...props()} />);
  await screen.findByRole("listitem", { name: "Farmácia" });
  const resumo = screen.getByText(/^Saldos iniciais \(1\)$/);
  const detalhes = resumo.closest("details") as HTMLDetailsElement;
  expect(detalhes.open).toBe(false);
  expect(within(detalhes).getByRole("listitem", { name: "Saldo inicial" })).toBeTruthy();
  const lista = screen.getByRole("list", { name: "Aportes e resgates" });
  expect(lista.contains(detalhes)).toBe(false);
  expect(Boolean(lista.compareDocumentPosition(detalhes) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
});

it("saldo inicial de posição que usa alocação por fração não oferece Desfazer e explica o porquê", async () => {
  await preparar();
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, opcoes?: RequestInit) => {
    const resposta = await fetchSimulado(url, opcoes);
    if (new URL(String(url)).pathname.endsWith("/investimentos")) {
      const lista = await resposta.json();
      return new Response(JSON.stringify(lista.map((i: object) => ({ ...i, alocacao_por_fracao: true }))), { status: 200 });
    }
    return resposta;
  });
  render(<AportesEResgates {...props()} />);
  const saldo = (await screen.findByText(/^Saldos iniciais \(1\)$/)).closest("details") as HTMLDetailsElement;
  const item = within(saldo).getByRole("listitem", { name: "Saldo inicial" });
  expect(within(item).getByText("Substituído pelas operações da posição.")).toBeTruthy();
  expect(within(item).queryByRole("button", { name: /Mais ações de saldo inicial/ })).toBeNull();
});
