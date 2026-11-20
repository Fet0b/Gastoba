import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CompraDaFatura } from "../../api/tipos";
import { formatar } from "../../dinheiro/dinheiro";
import { ListaDeCompras } from "./ListaDeCompras";

function compra(extra: Partial<CompraDaFatura> = {}): CompraDaFatura {
  return {
    id: "c1",
    data: "2026-10-20",
    descricao: "Anthropic",
    valor: "118.05",
    sentido: "saida",
    parcela_numero: null,
    parcela_total: null,
    estado: "pendente",
    ...extra,
  };
}

describe("ListaDeCompras", () => {
  it("mostra data, descrição e valor", () => {
    const { container } = render(<ListaDeCompras compras={[compra()]} />);

    expect(container.textContent).toContain("20/10/2026");
    expect(container.textContent).toContain("Anthropic");
    expect(container.textContent).toContain(formatar("118.05"));
  });

  it("o estorno aparece como valor negativo", () => {
    const { container } = render(
      <ListaDeCompras compras={[compra({ sentido: "entrada", valor: "10.00", descricao: "Estorno" })]} />,
    );
    expect(container.textContent).toContain(formatar("-10.00"));
  });

  it("mostra a parcela como 2/10 só quando há", () => {
    const { container, rerender } = render(
      <ListaDeCompras compras={[compra({ parcela_numero: 2, parcela_total: 10 })]} />,
    );
    expect(container.textContent).toContain("Parcela 2/10");
    rerender(<ListaDeCompras compras={[compra()]} />);
    expect(container.textContent).not.toContain("Parcela");
  });

  it.each([
    [{ estado: "pendente" as const }, "Na caixa"],
    [{ estado: "aceita" as const }, "Gasto"],
    [{ estado: "aceita" as const, sentido: "entrada" as const }, "Ganho"],
    [{ estado: "ignorada" as const }, "Ignorada"],
  ])("o estado %j aparece como '%s' em selo de texto", (extra, texto) => {
    const { container } = render(<ListaDeCompras compras={[compra(extra)]} />);
    expect(container.querySelector("[data-badge]")?.textContent).toBe(texto);
  });

  it("sem compras diz que não há nenhuma", () => {
    render(<ListaDeCompras compras={[]} />);
    expect(screen.getByText("Nenhuma compra nesta fatura.")).toBeTruthy();
  });
});
