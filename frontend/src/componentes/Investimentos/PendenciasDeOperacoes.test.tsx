import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { PendenciasDeOperacoes } from "./PendenciasDeOperacoes";

it("mostra os motivos sem inventar uma operação financeira", () => {
  render(<PendenciasDeOperacoes pendencias={[{ tipo: "AMORTIZATION", data: "2026-10-03", motivo: "tipo_sem_traducao" }, { tipo: "SELL", data: "2026-10-04", motivo: "resgate_sem_historico" }]} />);
  expect(screen.getByText(/não foi traduzido/)).toBeTruthy();
  expect(screen.getByText(/saldo anterior/)).toBeTruthy();
});
