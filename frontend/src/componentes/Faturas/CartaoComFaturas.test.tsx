import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CartaoComFaturas as Cartao } from "../../api/tipos";
import { CartaoComFaturas } from "./CartaoComFaturas";

const CARTAO: Cartao = { conta_id: "c1", conta_nome: "Nubank", valor_devido: "0.00", faturas: [] };

describe("CartaoComFaturas (identificação)", () => {
  it("mostra o rótulo do cartão e o final do número, quando a conta o tem", () => {
    render(<CartaoComFaturas cartao={CARTAO} hoje="2026-11-05" finalDoNumero="7788" />);
    expect(screen.getByRole("heading", { level: 3, name: "Nubank" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Faturas do cartão Nubank, final 7788" })).toBeTruthy();
    expect(screen.getByText("final 7788")).toBeTruthy();
  });

  it("sem final, não inventa nenhum", () => {
    const { container } = render(<CartaoComFaturas cartao={CARTAO} hoje="2026-11-05" />);
    expect(container.textContent).not.toContain("final");
    expect(screen.getByRole("region", { name: "Faturas do cartão Nubank" })).toBeTruthy();
  });
});
