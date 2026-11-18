import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { chamar } from "../../api/cliente";
import type { Investimento } from "../../api/tipos";
import { adicionarInvestimentoSimulado, adicionarOperacaoSimulada, entrarNaSimulacao } from "../../simulacao/manipuladores";
import { LinhaDaPosicao } from "./LinhaDaPosicao";

function preparar() {
  entrarNaSimulacao();
  const id = adicionarInvestimentoSimulado({ nome: "Fundo exemplo", tipo: "EQUITY", saldo: "120.00", faltam_cotas: "2" });
  const investimento: Investimento = { id, nome: "Fundo exemplo", tipo: "EQUITY", subtipo: null, saldo: "120.00", valor_aplicado: null, rendimento: null, rentabilidade: null, origem_da_rentabilidade: null, taxa: null, atualizado_em: null, destinacoes: [], historico_completo: false, acao_do_historico: "completar", pendencias: [{ tipo: "faltam_cotas", quantidade_estimada: "2" }] };
  const avisar = vi.fn();
  render(<ul><LinhaDaPosicao investimento={investimento} aoAvisar={avisar} aoFalhar={vi.fn()} /></ul>);
  return { id, avisar };
}

it("lança a compra faltante pelo aviso de histórico, sem converter dinheiro para número", async () => {
  const { id, avisar } = preparar();
  fireEvent.click(screen.getByRole("button", { name: "Completar histórico" }));
  await screen.findByRole("combobox", { name: "Tipo de operação" });
  fireEvent.change(screen.getByLabelText("Quantidade"), { target: { value: "2.5" } });
  fireEvent.change(screen.getByLabelText("Valor bruto (R$)"), { target: { value: "10000" } });
  fireEvent.click(within(screen.getByRole("dialog", { name: "Lançar operação" })).getByRole("button", { name: "Lançar operação" }));
  await waitFor(() => expect(avisar).toHaveBeenCalledWith("Operação lançada."));
  const operacoes = await chamar<{ quantidade: string; valor: string }[]>(`/investimentos/${id}/operacoes`);
  expect(operacoes).toMatchObject([{ quantidade: "2.5", valor: "100.00" }]);
});

it("edita a abertura estimada e exclui só depois da confirmação, preservando o foco", async () => {
  const { id, avisar } = preparar();
  const abertura = adicionarOperacaoSimulada(id, { tipo: "ABERTURA", data: "2026-10-01", quantidade: "2", valor: "100.00", origem: "abertura", quantidade_estimada: true });
  const menu = screen.getByRole("button", { name: /Mais ações/ });
  menu.focus();
  fireEvent.click(menu);
  fireEvent.click(screen.getByRole("menuitem", { name: "Ver operações e abertura" }));
  fireEvent.click(await screen.findByRole("button", { name: "Editar abertura" }));
  fireEvent.change(screen.getByLabelText("Quantidade"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar operação" }));
  await waitFor(() => expect(avisar).toHaveBeenCalledWith("Operação atualizada."));
  expect(await chamar(`/investimentos/${id}/operacoes`)).toMatchObject([{ id: abertura, quantidade: "3", quantidade_estimada: false }]);
  fireEvent.click(await screen.findByRole("button", { name: "Excluir abertura" }));
  expect(await chamar(`/investimentos/${id}/operacoes`)).toHaveLength(1);
  expect(document.activeElement?.textContent).toBe("Cancelar");
  fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
  await waitFor(() => expect(avisar).toHaveBeenCalledWith("Operação excluída. As caixinhas foram preservadas."));
  expect(await chamar(`/investimentos/${id}/operacoes`)).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
  expect(document.activeElement).toBe(menu);
});

it("exige operação relacionada para imposto e não oferece edição de operação da corretora", async () => {
  const { id } = preparar();
  adicionarOperacaoSimulada(id, { tipo: "COMPRA", data: "2026-10-01", quantidade: "2", valor: "100.00", origem: "pluggy" });
  fireEvent.click(screen.getByRole("button", { name: /Mais ações/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Ver operações e abertura" }));
  expect(await screen.findByText("Corretora")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Editar/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Lançar operação" }));
  fireEvent.change(screen.getByLabelText("Tipo de operação"), { target: { value: "IMPOSTO" } });
  expect((screen.getByLabelText("Operação relacionada") as HTMLSelectElement).value).toBe("");
  expect(screen.getByText("Escolha a operação relacionada ao custo ou imposto.")).toBeTruthy();
});

it("sinaliza compra duplicada e só grava uma segunda operação após confirmação explícita", async () => {
  const { id, avisar } = preparar();
  adicionarOperacaoSimulada(id, { tipo: "COMPRA", data: "2026-10-01", quantidade: "2", valor: "100.00", origem: "pluggy" });
  fireEvent.click(screen.getByRole("button", { name: "Completar histórico" }));
  await screen.findByLabelText("Quantidade");
  fireEvent.change(screen.getByLabelText("Data da operação"), { target: { value: "2026-10-01" } });
  fireEvent.change(screen.getByLabelText("Quantidade"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Valor bruto (R$)"), { target: { value: "10000" } });
  fireEvent.click(within(screen.getByRole("dialog", { name: "Lançar operação" })).getByRole("button", { name: "Lançar operação" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar que é outra operação" }));
  expect(await chamar(`/investimentos/${id}/operacoes`)).toHaveLength(1);
  await waitFor(() => expect(document.activeElement?.textContent).toBe("Cancelar"));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar outra operação" }));
  await waitFor(() => expect(avisar).toHaveBeenCalledWith("Operação lançada."));
  expect(await chamar(`/investimentos/${id}/operacoes`)).toHaveLength(2);
});

it("mantém a operação e mostra o erro quando há taxa vinculada à exclusão", async () => {
  const { id } = preparar();
  const compra = adicionarOperacaoSimulada(id, { tipo: "COMPRA", data: "2026-10-01", quantidade: "2", valor: "100.00", origem: "manual" });
  adicionarOperacaoSimulada(id, { tipo: "TAXA", data: "2026-10-01", quantidade: "0", valor: "1.00", origem: "manual", operacao_relacionada_id: compra });
  fireEvent.click(screen.getByRole("button", { name: /Mais ações/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Ver operações e abertura" }));
  await screen.findAllByRole("button", { name: "Excluir operação" });
  fireEvent.click(within(screen.getByText("Compra", { exact: true }).closest("li")!).getByRole("button", { name: "Excluir operação" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
  expect(await screen.findByText("Remova antes as taxas e os impostos ligados a esta operação.")).toBeTruthy();
  expect(await chamar(`/investimentos/${id}/operacoes`)).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
});

it("confirma só a quantidade da compra da corretora que veio sem ela", async () => {
  const { id, avisar } = preparar();
  adicionarOperacaoSimulada(id, { tipo: "COMPRA", data: "2026-10-21", quantidade: "3", valor: "455.28", origem: "pluggy", quantidade_estimada: true });
  fireEvent.click(screen.getByRole("button", { name: /Mais ações/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Ver operações e abertura" }));
  await screen.findByText("Estimada, confirme");
  expect(screen.queryByRole("button", { name: "Excluir operação" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar quantidade" }));
  await screen.findByLabelText("Quantidade");
  fireEvent.change(screen.getByLabelText("Quantidade"), { target: { value: "3" } });
  fireEvent.click(within(screen.getByRole("dialog", { name: "Editar operação" })).getByRole("button", { name: "Salvar operação" }));
  await waitFor(() => expect(avisar).toHaveBeenCalledWith("Operação atualizada."));
  const operacoes = await chamar<{ quantidade: string; quantidade_estimada: boolean }[]>(`/investimentos/${id}/operacoes`);
  expect(operacoes).toMatchObject([{ quantidade: "3", quantidade_estimada: false }]);
});
