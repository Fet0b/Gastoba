import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { semearCasosDaCaixa } from "../../simulacao/manipuladores";
import { RevisaoDaBolsa } from "./RevisaoDaBolsa";

beforeEach(() => { entrarNaSimulacao(); semearCasosDaCaixa(); });

function abrir(resumo: RegExp) { const r = screen.getByText(resumo); (r.closest("details") as HTMLDetailsElement).open = true; }
async function montar() {
  const aoAvisar = vi.fn();
  render(<RevisaoDaBolsa aoAvisar={aoAvisar} aoFechar={() => {}} />);
  await screen.findByRole("heading", { name: "Pregão de 03/11/2026" });
  abrir(/Sem par na corretora/);
  return aoAvisar;
}
const item = () => screen.getByRole("listitem", { name: /LIQ BOLSA - VISTA BRUTO - PREGÃO: 28\/10\/2026/ });

it("o gasto antigo de liquidação oferece 'Trocar pela ligação' e os outros itens não", async () => {
  await montar();
  expect(within(item()).getByRole("button", { name: /Trocar pela ligação/ })).toBeTruthy();
  const outro = screen.getByRole("listitem", { name: "Compra de AUVP11 (3)" });
  expect(within(outro).queryByRole("button", { name: /Trocar pela ligação/ })).toBeNull();
});

it("pede confirmação com foco em Cancelar, cancela sem chamada e só então troca", async () => {
  const aoAvisar = await montar();
  fireEvent.click(within(item()).getByRole("button", { name: /Trocar pela ligação/ }));
  const cancelar = await screen.findByRole("button", { name: "Cancelar" });
  expect(document.activeElement).toBe(cancelar);
  fireEvent.click(cancelar);
  expect(aoAvisar).not.toHaveBeenCalled();
  fireEvent.click(within(item()).getByRole("button", { name: /Trocar pela ligação/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Sim, trocar" }));
  await waitFor(() => expect(aoAvisar).toHaveBeenCalledWith("Gasto trocado pela ligação: a liquidação saiu das despesas."));
  await waitFor(() => expect(screen.queryByRole("listitem", { name: /PREGÃO: 28\/10\/2026/ })).toBeNull());
});
