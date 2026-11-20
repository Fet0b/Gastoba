import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { TextoDeConta } from "./TextoDeConta";

it("mostra o texto da conta e o deixa inteiro na dica acessível", () => {
  render(<TextoDeConta texto="Conta corrente do trabalho e das viagens, final 0412" />);
  const texto = screen.getByText("Conta corrente do trabalho e das viagens, final 0412");
  expect(texto.getAttribute("title")).toBe("Conta corrente do trabalho e das viagens, final 0412");
  expect(texto.hasAttribute("data-conta-texto")).toBe(true);
});
