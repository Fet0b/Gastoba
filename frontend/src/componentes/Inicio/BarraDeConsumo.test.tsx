import { render, screen } from "@testing-library/react";
import { it, expect } from "vitest";

import { BarraDeConsumo } from "./BarraDeConsumo";

it("expõe consumo, limite e dia em texto acessível e mantém a fração", () => {
  const { container } = render(
    <BarraDeConsumo gasto="25.00" disponivel="100.00" hoje="2026-11-09" periodo={{ ano: 2026, mes: 11 }} />,
  );
  expect(screen.getByRole("img", { name: /Gasto R\$\s*25,00 de R\$\s*100,00; dia 9 de 30/ })).toBeTruthy();
  expect(container.querySelector("[data-fracao='250']")).toBeTruthy();
});

it("mês passado mostra o último dia e gasto acima do disponível enche a barra", () => {
  const { container } = render(
    <BarraDeConsumo gasto="125.00" disponivel="100.00" hoje="2026-11-09" periodo={{ ano: 2026, mes: 10 }} />,
  );
  expect(screen.getByRole("img", { name: /dia 31 de 31/ })).toBeTruthy();
  expect(container.querySelector("[data-fracao='1000']")).toBeTruthy();
});
