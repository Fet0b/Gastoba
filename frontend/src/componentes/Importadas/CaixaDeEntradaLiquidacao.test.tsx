import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";

import { chamar } from "../../api/cliente";
import type { Sincronizacao, TransacaoImportada } from "../../api/tipos";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { semearCasosDaCaixa } from "../../simulacao/manipuladores";
import { CaixaDeEntrada } from "./CaixaDeEntrada";

beforeEach(() => { entrarNaSimulacao(); semearCasosDaCaixa(); });

async function abrir() {
  await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
  render(<CaixaDeEntrada aoAvisar={() => {}} aoSinalizarOlho={() => {}} />);
  await screen.findByRole("button", { name: "Sincronizar agora" });
}
const liquidacao = () => screen.findByRole("listitem", { name: /LIQ BOLSA - VISTA BRUTO/ });

it("o cartão da liquidação bruta não oferece categoria, gasto, ganho nem lote, e leva à Revisão da bolsa", async () => {
  await abrir();
  const cartao = await liquidacao();
  expect(within(cartao).queryByRole("button", { name: /Aceitar como gasto/ })).toBeNull();
  expect(within(cartao).queryByRole("button", { name: /Aceitar como ganho/ })).toBeNull();
  expect(within(cartao).queryByLabelText(/Selecionar para aceitar em lote/)).toBeNull();
  expect(within(cartao).queryByText("Gasto")).toBeNull();
  expect(cartao.textContent).toMatch(/não é gasto nem ganho/);
  expect(within(cartao).getByRole("button", { name: /Ignorar/ })).toBeTruthy();
  fireEvent.click(within(cartao).getByRole("button", { name: /^Revisar na bolsa/ }));
  expect(await screen.findByRole("dialog", { name: "Revisão da bolsa" })).toBeTruthy();
});

it("a simulação recusa a liquidação como gasto, como o servidor", async () => {
  await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
  const caixa = await chamar<TransacaoImportada[]>("/transacoes-importadas");
  const bruto = caixa.find((t) => t.liquidacao_de_bolsa === true)!;
  await expect(chamar(`/transacoes-importadas/${bruto.id}/aceitar`, { metodo: "POST", corpo: { categoria: "lazer", tags: [] } })).rejects.toMatchObject({ codigo: "transacao_importada_invalida" });
  await waitFor(() => expect(bruto.liquidacao_de_bolsa).toBe(true));
});
