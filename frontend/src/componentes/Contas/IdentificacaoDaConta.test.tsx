import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Conta } from "../../api/tipos";
import { IdentificacaoDaConta } from "./IdentificacaoDaConta";

const conta: Conta = {
  id: "c1",
  nome: "Nubank (2)",
  saldo: "10.00",
  origem: "open_finance",
  tipo: "corrente",
  rotulo: "Nubank",
  apelido: null,
  nome_no_banco: "Nubank",
  final_do_numero: "0412",
};

describe("IdentificacaoDaConta", () => {
  it("mostra o rótulo, o tipo e o final, nunca o nome interno com o sequencial", () => {
    const { container } = render(<IdentificacaoDaConta conta={conta} />);
    expect(container.textContent).toContain("Nubank");
    expect(container.textContent).toContain("Conta corrente");
    expect(container.textContent).toContain("final 0412");
    expect(container.textContent).not.toContain("(2)");
  });

  it("sem final, mostra só o rótulo e o tipo", () => {
    const { container } = render(<IdentificacaoDaConta conta={{ ...conta, final_do_numero: null }} />);
    expect(container.textContent).not.toContain("final");
    expect(container.textContent).toContain("Conta corrente");
  });

  it("o apelido vence o nome do banco e o rótulo longo vai inteiro no title", () => {
    const { container } = render(
      <IdentificacaoDaConta conta={{ ...conta, apelido: "Conta da casa", rotulo: "Conta da casa" }} />,
    );
    const rotulo = container.querySelector("[data-rotulo]");
    expect(rotulo?.textContent).toBe("Conta da casa");
    expect(rotulo?.getAttribute("title")).toBe("Conta da casa");
  });

  it("o cartão de crédito diz o tipo na própria identificação", () => {
    const { container } = render(<IdentificacaoDaConta conta={{ ...conta, tipo: "cartao" }} />);
    expect(container.textContent).toContain("Cartão de crédito");
  });
});
