import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { chamar } from "../../api/cliente";
import type { Investimento } from "../../api/tipos";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { adicionarInvestimentoSimulado } from "../../simulacao/manipuladores";
import { LinhaDaPosicao } from "./LinhaDaPosicao";

beforeEach(() => entrarNaSimulacao());
afterEach(cleanup);

it("AUPO11 fictício não mostra a estimativa pelos aportes: mostra a pendência", async () => {
  adicionarInvestimentoSimulado({ nome: "AUPO11", tipo: "EQUITY", subtipo: "ETF", saldo: "3692.37", faltam_cotas: "25" });
  const lista = await chamar<Investimento[]>("/investimentos");
  const aupo = lista.find(i => i.nome === "AUPO11")!;
  render(<ul><LinhaDaPosicao investimento={aupo} aoAvisar={vi.fn()} aoFalhar={vi.fn()} /></ul>);
  await waitFor(() => expect(screen.getByText("Histórico incompleto")).toBeTruthy());
  expect(screen.getByText("Sem rentabilidade")).toBeTruthy();
  expect(screen.getByText("Faltam ~25 cotas de AUPO11: informe data e preço.")).toBeTruthy();
});
