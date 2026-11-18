import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { RevisaoDaBolsa } from "./RevisaoDaBolsa";

beforeEach(() => entrarNaSimulacao());

const montar = () => { const aoAvisar = vi.fn(), aoFechar = vi.fn(); render(<RevisaoDaBolsa aoAvisar={aoAvisar} aoFechar={aoFechar} />); return { aoAvisar, aoFechar }; };
const linha = (nome: RegExp) => screen.getByRole("listitem", { name: nome });

it("mostra o esqueleto enquanto carrega", () => {
  montar();
  expect(screen.getByRole("status", { name: "Carregando a revisão da bolsa" })).toBeTruthy();
});

it("mostra erro com 'Tentar de novo'", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ erro: { codigo: "erro_interno", mensagem: "Falhou." } }), { status: 500 })));
  montar();
  expect(await screen.findByRole("button", { name: "Tentar novamente" })).toBeTruthy();
});

it("mostra 'Tudo conferido' quando não há nada a revisar", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ propostas: [], sem_par: [], confirmados: [] }), { status: 200 })));
  montar();
  expect(await screen.findByText("Tudo conferido")).toBeTruthy();
  expect(screen.getByText("Os lançamentos da conta e as operações da corretora estão ligados.")).toBeTruthy();
});

it("agrupa por pregão e mostra valor com sinal, situação e selo de valores iguais", async () => {
  montar();
  expect(await screen.findByRole("heading", { name: "Pregão de 03/11/2026" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Pregão de 27/10/2026" })).toBeTruthy();
  const aupo = linha(/Compra de AUPO11/);
  expect(within(aupo).getByText("\u2212R$ 2.789,30")).toBeTruthy();
  expect(within(aupo).getByText("hoje: aporte sem investimento")).toBeTruthy();
  expect(within(aupo).getByText("Valores iguais")).toBeTruthy();
  expect(within(linha(/BBAS3/)).getByText("hoje: na caixa de entrada")).toBeTruthy();
});

it("'Ver evidência' traz a tabela e o que muda; taxas que diferem ganham selo", async () => {
  montar();
  const aupo = await waitFor(() => linha(/Compra de AUPO11/));
  expect(within(aupo).getByText("Taxas diferem em R$ 0,13")).toBeTruthy();
  fireEvent.click(within(aupo).getByText("Ver evidência"));
  expect(within(aupo).getByRole("table")).toBeTruthy();
  expect(within(aupo).getByText("Saldo, custo da posição e caixinhas não mudam.")).toBeTruthy();
  expect(within(linha(/BBAS3/)).queryByText(/Taxas diferem/)).toBeNull();
});

// --- seleção e confirmação -------------------------------------------------------------------

it("'Selecionar as 2 com valores iguais' marca só as exatas e o botão diz quantas liga", async () => {
  const { aoAvisar } = montar();
  const ligar = await screen.findByRole("button", { name: "Ligar 0 selecionadas" });
  expect((ligar as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("Selecione ao menos uma proposta.")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar as 2 com valores iguais" }));
  const ligar2 = screen.getByRole("button", { name: "Ligar 2 selecionadas" });
  expect((ligar2 as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(ligar2);
  await waitFor(() => expect(aoAvisar).toHaveBeenCalledWith("2 ligações feitas com as operações da corretora."));
  await waitFor(() => expect(screen.queryByRole("listitem", { name: /Compra de AUPO11/ })).toBeNull());
  expect(screen.getByRole("button", { name: "Ligar 0 selecionadas" })).toBeTruthy();
});

it("a caixa de cada proposta tem rótulo com ativo, pregão e valor; 'Ligar só esta' liga uma", async () => {
  const { aoAvisar } = montar();
  await screen.findByRole("heading", { name: "Pregão de 03/11/2026" });
  expect(screen.getByRole("checkbox", { name: "Selecionar compra de AUPO11 de 03/11/2026, \u2212R$ 2.789,30" })).toBeTruthy();
  fireEvent.click(within(linha(/BBAS3/)).getByRole("button", { name: /Mais ações/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Ligar só esta" }));
  await waitFor(() => expect(aoAvisar).toHaveBeenCalledWith("1 ligação feita com as operações da corretora."));
  await waitFor(() => expect(screen.queryByRole("listitem", { name: /BBAS3/ })).toBeNull());
  expect(screen.getByRole("listitem", { name: /AUPO11/ })).toBeTruthy();
});

it("409 de versão mostra o alerta junto ao rodapé e recarrega a lista", async () => {
  montar();
  await screen.findByRole("heading", { name: "Pregão de 03/11/2026" });
  const original = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn(async (entrada: RequestInfo | URL, inicio?: RequestInit) => {
    if (String(entrada).includes("/revisao-da-bolsa/confirmar")) return new Response(JSON.stringify({ erro: { codigo: "revisao_desatualizada", mensagem: "A revisão mudou." } }), { status: 409 });
    return original(entrada, inicio);
  }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar as 2 com valores iguais" }));
  fireEvent.click(screen.getByRole("button", { name: "Ligar 2 selecionadas" }));
  const alerta = await screen.findByRole("alert");
  expect(alerta.textContent).toContain("Os dados mudaram. A lista foi atualizada; confira e confirme de novo.");
});

// --- escolha manual e já ligados -------------------------------------------------------------

function abrir(resumo: RegExp) { const r = screen.getByText(resumo); (r.closest("details") as HTMLDetailsElement).open = true; }

it("escolha manual: sem pré-seleção, botão desabilitado com o motivo e envia só o que foi escolhido", async () => {
  const { aoAvisar } = montar();
  await screen.findByRole("heading", { name: "Pregão de 03/11/2026" });
  abrir(/Precisa de escolha \(1\)/);
  const escolha = screen.getByRole("listitem", { name: /Escolher Compra de VALE3/ });
  const caixas = within(escolha).getAllByRole("checkbox") as HTMLInputElement[];
  expect(caixas).toHaveLength(2);
  expect(caixas.every(c => !c.checked)).toBe(true);
  const ligar = within(escolha).getByRole("button", { name: "Ligar a escolha" }) as HTMLButtonElement;
  expect(ligar.disabled).toBe(true);
  expect(within(escolha).getByText("Escolha ao menos uma operação.")).toBeTruthy();
  fireEvent.click(caixas[0]);
  expect(ligar.disabled).toBe(false);
  fireEvent.click(ligar);
  await waitFor(() => expect(aoAvisar).toHaveBeenCalledWith("1 ligação feita com as operações da corretora."));
});

it("já ligados: desfazer pede confirmação com foco em Cancelar e avisa o sucesso", async () => {
  const { aoAvisar } = montar();
  await screen.findByRole("heading", { name: "Pregão de 03/11/2026" });
  abrir(/Já ligados \(1\)/);
  expect(screen.getByText("Sem aporte registrado")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Mais ações da ligação/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Desfazer ligação" }));
  const dialogo = await screen.findByRole("dialog", { name: "Desfazer a ligação?" });
  expect(within(dialogo).getByText(/Os lançamentos voltam à caixa de entrada como pendentes/)).toBeTruthy();
  await waitFor(() => expect(document.activeElement?.textContent).toBe("Cancelar"));
  fireEvent.click(within(dialogo).getByRole("button", { name: "Desfazer ligação" }));
  await waitFor(() => expect(aoAvisar).toHaveBeenCalledWith("Ligação desfeita: os lançamentos voltaram à caixa."));
});

it("'Refazer ligação' faz uma só chamada e some o selo de sem aporte", async () => {
  const { aoAvisar } = montar();
  await screen.findByRole("heading", { name: "Pregão de 03/11/2026" });
  abrir(/Já ligados \(1\)/);
  const original = globalThis.fetch;
  const chamadas: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (entrada: RequestInfo | URL, inicio?: RequestInit) => { if (String(entrada).includes("/refazer")) chamadas.push(String(entrada)); return original(entrada, inicio); }));
  fireEvent.click(screen.getByRole("button", { name: /Mais ações da ligação/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Refazer ligação" }));
  await waitFor(() => expect(aoAvisar).toHaveBeenCalledWith("Ligação refeita: o aporte foi registrado."));
  expect(chamadas).toHaveLength(1);
  await waitFor(() => expect(screen.queryByText("Sem aporte registrado")).toBeNull());
});

it("'Sem par' diz qual operação é, com data e valor, e explica que não há o que fazer", async () => {
  montar();
  await screen.findByRole("heading", { name: "Pregão de 03/11/2026" });
  abrir(/Sem par na corretora \(1\)/);
  const item = screen.getByRole("listitem", { name: "Compra de AUVP11 (3)" });
  expect(within(item).getByText("R$ 455,28")).toBeTruthy();
  expect(within(item).getByText("21/10/2026")).toBeTruthy();
  expect(within(item).getByText("Nenhum lançamento corresponde a esta operação.")).toBeTruthy();
  expect(screen.getByText(/Não há nada a fazer aqui/)).toBeTruthy();
});
