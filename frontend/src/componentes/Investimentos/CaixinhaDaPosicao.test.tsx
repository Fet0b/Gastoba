import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Investimento } from "../../api/tipos";
import { LinhaDaPosicao } from "./LinhaDaPosicao";

it("oferece alocar o dinheiro sem caixinha pelo editor compartilhado", async () => {
  const i: Investimento = { id: "i", nome: "Fundo exemplo", tipo: "EQUITY", subtipo: null, saldo: "150.00", valor_aplicado: "150.00", rendimento: "0.00", rentabilidade: "0", origem_da_rentabilidade: "instituicao", taxa: null, atualizado_em: null, alocacao_por_fracao: true, destinacoes: [{ tag: "viagem", principal: "100.00", valor_atual: "100.00", rendimento: "0.00", rentabilidade: "0", cor: null }, { tag: null, principal: "0.00", valor_atual: "50.00", rendimento: "0.00", rentabilidade: null, cor: null }] };
  const fetch = vi.fn(async (_entrada: unknown) => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  const avisar = vi.fn();
  render(<ul><LinhaDaPosicao investimento={i} aoAvisar={avisar} aoFalhar={vi.fn()} /></ul>);
  expect(screen.getByText(/Sem caixinha/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Mais ações/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Alocar em caixinhas" }));
  fireEvent.change(screen.getByLabelText("Tag da destinação 1"), { target: { value: "viagem" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar caixinhas" }));
  await waitFor(() => expect(avisar).toHaveBeenCalled());
  expect(String(fetch.mock.calls[0][0])).toContain("/alocar-sem-caixinha");
});
