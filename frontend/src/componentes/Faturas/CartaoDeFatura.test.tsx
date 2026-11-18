import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Fatura } from "../../api/tipos";
import { formatar } from "../../dinheiro/dinheiro";
import { CartaoDeFatura } from "./CartaoDeFatura";

function fatura(extra: Partial<Fatura> = {}): Fatura {
  return {
    id: "f1",
    inicio: "2026-10-16",
    fechamento: "2026-11-15",
    vencimento: "2026-11-22",
    total: "122.18",
    pago: "0.00",
    restante: "122.18",
    a_favor: "0.00",
    minimo: null,
    situacao: "aberta",
    fonte: "banco",
    quantidade_de_compras: 2,
    ...extra,
  };
}

describe("CartaoDeFatura", () => {
  it("mostra total, vencimento, pago e restante formatados", () => {
    const { container } = render(<CartaoDeFatura fatura={fatura({ pago: "20.00", restante: "102.18" })} destaque />);

    expect(container.textContent).toContain(formatar("122.18"));
    expect(container.textContent).toContain("22/11/2026");
    expect(container.textContent).toContain(formatar("20.00"));
    expect(container.textContent).toContain(formatar("102.18"));
    expect(screen.getByText("Fatura com fechamento em 15/11/2026")).toBeTruthy();
  });

  it.each([
    ["aberta", "Aberta"],
    ["fechada", "Fechada"],
    ["paga", "Paga"],
    ["vencida", "Vencida"],
  ] as const)("a situação %s aparece em texto", (situacao, texto) => {
    const { container } = render(<CartaoDeFatura fatura={fatura({ situacao })} destaque />);
    expect(container.querySelector("[data-badge]")?.textContent).toBe(texto);
  });

  it("fatura estimada traz o aviso; a do banco não", () => {
    const { container, rerender } = render(<CartaoDeFatura fatura={fatura({ fonte: "estimada" })} destaque />);
    expect(container.querySelector('[data-aviso="estimativa"]')?.textContent).toContain("Fatura estimada");
    rerender(<CartaoDeFatura fatura={fatura({ fonte: "banco" })} destaque />);
    expect(container.querySelector('[data-aviso="estimativa"]')).toBeNull();
  });

  it("sem vencimento diz 'Sem data'; com valor a favor mostra 'A favor'", () => {
    const { container } = render(
      <CartaoDeFatura fatura={fatura({ vencimento: null, a_favor: "20.00" })} destaque />,
    );
    expect(container.textContent).toContain("Sem data");
    expect(container.textContent).toContain("A favor");
  });

  it("sem valor a favor não mostra 'A favor'", () => {
    const { container } = render(<CartaoDeFatura fatura={fatura()} destaque />);
    expect(container.textContent).not.toContain("A favor");
  });

  it("a em destaque mostra o conteúdo e não tem botão", () => {
    render(
      <CartaoDeFatura fatura={fatura()} destaque>
        <p>compras aqui</p>
      </CartaoDeFatura>,
    );
    expect(screen.getByText("compras aqui")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a recolhível esconde o conteúdo e o botão tem aria-expanded", () => {
    const aoAlternar = vi.fn();
    const { rerender } = render(
      <CartaoDeFatura fatura={fatura()} aberta={false} aoAlternar={aoAlternar}>
        <p>compras aqui</p>
      </CartaoDeFatura>,
    );
    const botao = screen.getByRole("button", { name: "Ver compras (2)" });
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("compras aqui")).toBeNull();

    fireEvent.click(botao);
    expect(aoAlternar).toHaveBeenCalledOnce();

    rerender(
      <CartaoDeFatura fatura={fatura()} aberta aoAlternar={aoAlternar}>
        <p>compras aqui</p>
      </CartaoDeFatura>,
    );
    expect(screen.getByRole("button", { name: "Esconder compras" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("compras aqui")).toBeTruthy();
  });
});
