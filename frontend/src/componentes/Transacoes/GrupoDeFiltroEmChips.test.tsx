import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GrupoDeFiltroEmChips } from "./GrupoDeFiltroEmChips";

const OPCOES = [
  { valor: "c1", rotulo: "Carteira" },
  { valor: "c2", rotulo: "Nubank" },
];

describe("GrupoDeFiltroEmChips", () => {
  it("mostra um chip por opção e só as escolhidas ficam pressionadas (podem ser várias)", () => {
    render(
      <GrupoDeFiltroEmChips legenda="conta" titulo="Contas" opcoes={OPCOES} selecionados={["c1", "c2"]} aoAlternar={vi.fn()} />,
    );
    const grupo = screen.getByRole("group", { name: "Filtrar por conta" });
    const botoes = within(grupo).getAllByRole("button");
    expect(botoes.map((b) => b.textContent)).toEqual(["Carteira", "Nubank"]);
    expect(botoes.map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "true"]);
  });

  it("clicar avisa o valor da opção", () => {
    const aoAlternar = vi.fn();
    render(
      <GrupoDeFiltroEmChips legenda="conta" titulo="Contas" opcoes={OPCOES} selecionados={[]} aoAlternar={aoAlternar} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Nubank" }));
    expect(aoAlternar).toHaveBeenCalledWith("c2");
  });

  it("sem opções não mostra nada", () => {
    const { container } = render(
      <GrupoDeFiltroEmChips legenda="tag" titulo="Tags" opcoes={[]} selecionados={[]} aoAlternar={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
