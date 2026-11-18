import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { Investimento } from "../../api/tipos";
import { PendenciaDeHistorico } from "./PendenciaDeHistorico";

const base: Investimento = {
  id: "i", nome: "AUPO11", tipo: "EQUITY", subtipo: "ETF", saldo: "3692.37", valor_aplicado: "2789.25",
  rendimento: "903.12", rentabilidade: "32.37", origem_da_rentabilidade: null, taxa: null,
  atualizado_em: null, destinacoes: [], historico_completo: false,
  motivo_sem_rentabilidade: "historico_incompleto",
  pendencias: [{ tipo: "faltam_cotas", quantidade_estimada: "25" }],
};

it("mostra o motivo e o que falta", () => {
  render(<PendenciaDeHistorico investimento={base} />);
  expect(screen.getByText("Histórico incompleto")).toBeTruthy();
  expect(screen.getByText("Faltam ~25 cotas de AUPO11: informe data e preço.")).toBeTruthy();
});

it("sem pendência numérica explica a quantidade desconhecida", () => {
  render(<PendenciaDeHistorico investimento={{ ...base, pendencias: [] }} />);
  expect(screen.getByText(/Complete o histórico/)).toBeTruthy();
});

it("não aparece com o histórico completo nem em resposta antiga", () => {
  const { container, rerender } = render(<PendenciaDeHistorico investimento={{ ...base, historico_completo: true, motivo_sem_rentabilidade: null }} />);
  expect(container.textContent).toBe("");
  rerender(<PendenciaDeHistorico investimento={{ ...base, historico_completo: undefined, motivo_sem_rentabilidade: undefined }} />);
  expect(container.textContent).toBe("");
});

it("o aviso tem papel de leitura para tecnologia assistiva", () => {
  render(<PendenciaDeHistorico investimento={base} />);
  expect(screen.getByRole("note")).toBeTruthy();
});
