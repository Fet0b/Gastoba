import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Investimento } from "../../api/tipos";
import { LinhaDaPosicao } from "./LinhaDaPosicao";
import { definirAlocacoesSimuladas, adicionarInvestimentoSimulado } from "../../simulacao/manipuladores";
import { entrarNaSimulacao, fetchSimulado } from "../../simulacao/fetchSimulado";

it("oferece alocar o dinheiro sem caixinha pelo editor compartilhado", async () => {
  entrarNaSimulacao();
  const id = adicionarInvestimentoSimulado({ nome: "Fundo exemplo", tipo: "EQUITY", saldo: "150.00", valor_aplicado: "150.00" });
  definirAlocacoesSimuladas(id, { viagem: "100.00" }, "50.00");
  const investimentos = await fetchSimulado("http://localhost:8000/investimentos", { credentials: "include" }).then((resposta) => resposta.json()) as Investimento[];
  const i = investimentos.find((investimento) => investimento.id === id)!;
  const fetch = vi.fn((entrada: RequestInfo | URL, opcoes?: RequestInit) => fetchSimulado(entrada, opcoes));
  vi.stubGlobal("fetch", fetch);
  const avisar = vi.fn();
  render(<ul><LinhaDaPosicao investimento={i} aoAvisar={avisar} aoFalhar={vi.fn()} /></ul>);
  expect(screen.getByText(/Sem caixinha/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Mais ações/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Alocar em caixinhas" }));
  await waitFor(() => expect(document.querySelector('datalist option[value="viagem"]')).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Tag da destinação 1"), { target: { value: "viagem" } });
  expect((screen.getByRole("form", { name: "Definir destinações de Fundo exemplo" }) as HTMLFormElement).checkValidity()).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Salvar caixinhas" }));
  await waitFor(() => expect(fetch.mock.calls.some(([entrada]) => String(entrada).includes("/alocar-sem-caixinha"))).toBe(true));
  await waitFor(() => expect(avisar).toHaveBeenCalled());
});
