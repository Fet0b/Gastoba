import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GraficoDeEvolucao } from "./GraficoDeEvolucao";

const serie = [
  { data: "2026-10-01", saldo: "100.00" },
  { data: "2026-10-02", saldo: "150.00" },
  { data: "2026-10-03", saldo: "200.00" },
];

describe("GraficoDeEvolucao", () => {
  it("lê em texto o último dia e anda pelos dias com as setas", () => {
    render(<GraficoDeEvolucao titulo="Saldo" serie={serie} />);
    const quadro = screen.getByRole("group", { name: /Saldo/ });

    expect(screen.getByRole("status").textContent).toContain("200,00");
    fireEvent.keyDown(quadro, { key: "ArrowLeft" });
    expect(screen.getByRole("status").textContent).toContain("150,00");
    fireEvent.keyDown(quadro, { key: "Home" });
    expect(screen.getByRole("status").textContent).toContain("100,00");
    fireEvent.keyDown(quadro, { key: "End" });
    expect(screen.getByRole("status").textContent).toContain("200,00");
  });

  it("tem uma tabela com todos os dias", () => {
    render(<GraficoDeEvolucao titulo="Saldo" serie={serie} />);
    expect(screen.getAllByRole("row", { hidden: true })).toHaveLength(4);
  });

  it("com um dia só, explica que a linha ainda vai se formar", () => {
    render(<GraficoDeEvolucao titulo="Saldo" serie={[serie[0]]} />);
    expect(screen.getByText(/Primeiro dia guardado/)).toBeTruthy();
  });

  it("sem pontos não desenha nada", () => {
    const { container } = render(<GraficoDeEvolucao titulo="Saldo" serie={[]} />);
    expect(container.innerHTML).toBe("");
  });
});

it("usa o recolhível e a tabela compartilhados com valores à direita",()=>{const {container}=render(<GraficoDeEvolucao titulo="Saldo" serie={[{data:"2026-11-01",saldo:"20.00"},{data:"2026-11-02",saldo:"25.00"}]}/>);expect(container.querySelector("summary")?.className).not.toBe("");expect(container.querySelector("table")?.className).not.toBe("");expect(container.querySelector("td")?.getAttribute("data-numerica")).toBe("true");});
