import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Categoria, Conta, Gasto } from "../../api/tipos";
import { UltimosGastos } from "./UltimosGastos";

const CONTAS = [{ id: "c1", nome: "Nubank" }] as Conta[];
const CATEGORIAS: Categoria[] = [{ codigo: "lazer", nome: "Lazer" }];

function gasto(n: number, data: string): Gasto {
  return {
    id: `g${n}`,
    conta_id: "c1",
    valor: "10.00",
    descricao: `Gasto ${n}`,
    data,
    categoria: "lazer",
    tags: [],
    origem: "manual",
    recorrencia_id: null,
  };
}

function desenhar(gastos: Gasto[] | undefined, carregando = false) {
  const aoVerTodas = vi.fn();
  render(
    <UltimosGastos
      gastos={gastos}
      carregando={carregando}
      contas={CONTAS}
      categorias={CATEGORIAS}
      aoVerTodas={aoVerTodas}
    />,
  );
  return { aoVerTodas };
}

describe("UltimosGastos", () => {
  it("mostra só os cinco mais recentes, na ordem", () => {
    desenhar([
      gasto(1, "2026-10-01"),
      gasto(2, "2026-10-07"),
      gasto(3, "2026-10-03"),
      gasto(4, "2026-10-09"),
      gasto(5, "2026-10-02"),
      gasto(6, "2026-10-08"),
      gasto(7, "2026-10-04"),
    ]);

    const descricoes = screen.getAllByRole("listitem").map((li) => li.querySelector("[data-descricao]")?.textContent);
    expect(descricoes).toEqual(["Gasto 4", "Gasto 6", "Gasto 2", "Gasto 7", "Gasto 3"]);
  });

  it("Ver todas chama a ação", () => {
    const { aoVerTodas } = desenhar([gasto(1, "2026-10-01")]);

    fireEvent.click(screen.getByRole("button", { name: "Ver todas" }));
    expect(aoVerTodas).toHaveBeenCalledTimes(1);
  });

  it("sem gastos no mês mostra o estado vazio", () => {
    desenhar([]);

    expect(screen.getByText("Nenhum gasto neste mês")).not.toBeNull();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("enquanto carrega, avisa; se falhou, diz que não foi possível", () => {
    const { unmount } = render(
      <UltimosGastos gastos={undefined} carregando contas={undefined} categorias={undefined} aoVerTodas={() => {}} />,
    );
    expect(screen.getByText("Carregando os gastos…")).not.toBeNull();
    unmount();
    desenhar(undefined, false);
    expect(screen.getByText("Não foi possível carregar os gastos.")).not.toBeNull();
  });
});
