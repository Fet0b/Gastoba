import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Investimento } from "../../api/tipos";
import { ListaDeInvestimentos } from "./ListaDeInvestimentos";

const base: Investimento = { id: "i", nome: "Conta investimentos", tipo: "CAIXINHA", subtipo: null, saldo: "10.00", valor_aplicado: null, rendimento: null, rentabilidade: null, origem_da_rentabilidade: null, taxa: null, atualizado_em: null, destinacoes: [] };

function cabecalhos(investimentos: Investimento[]): string[] {
  const { container } = render(<ListaDeInvestimentos investimentos={investimentos} aoAvisar={vi.fn()} aoFalhar={vi.fn()} />);
  return [...container.querySelectorAll("[data-cabecalho-da-lista] > span")].map((s) => s.textContent ?? "");
}

it("no grupo Conta investimentos o cabeçalho esconde Aplicado e Rendimento, mantendo as colunas", () => {
  expect(cabecalhos([base])).toEqual(["Posição", "", "Saldo", "", ""]);
});

it("nos outros grupos o cabeçalho mantém todas as colunas", () => {
  const cdb: Investimento = { ...base, id: "c", nome: "CDB", tipo: "FIXED_INCOME", subtipo: "CDB", valor_aplicado: "1.00", rendimento: "0.10" };
  expect(cabecalhos([cdb])).toEqual(["Posição", "Aplicado", "Saldo", "Rendimento", ""]);
});
