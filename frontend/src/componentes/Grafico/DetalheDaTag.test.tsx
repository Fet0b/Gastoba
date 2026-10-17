import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Gasto } from "../../api/tipos";
import type { Barra } from "../../graficos/barras";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { DetalheDaTag } from "./DetalheDaTag";

const NBSP = "\u{a0}";

beforeEach(() => {
  entrarNaSimulacao();
});

function gasto(i: number, tags: string[], valor = "10.00"): Gasto {
  return {
    id: `g${i}`,
    conta_id: "c1",
    valor,
    descricao: `Gasto ${String(i).padStart(2, "0")}`,
    data: `2026-06-${String(30 - i).padStart(2, "0")}`,
    categoria: "lazer",
    tags,
    origem: "manual",
    recorrencia_id: null,
  };
}

const BARRA: Pick<Barra, "tipo" | "rotulo" | "valor" | "percentual" | "quantidade" | "membros"> = {
  tipo: "tag",
  rotulo: "mercado",
  valor: "120.00",
  percentual: "40%",
  quantidade: 12,
};

describe("DetalheDaTag", () => {
  it("mostra a tag, o total, o percentual e a quantidade no cabeçalho", () => {
    render(<DetalheDaTag barra={BARRA} gastos={[gasto(1, ["mercado"])]} aoFechar={() => {}} />);

    const regiao = screen.getByRole("heading", { name: "mercado" }).parentElement as HTMLElement;
    expect(regiao.textContent).toContain("mercado");
    expect(regiao.textContent).toContain(`R$${NBSP}120,00`);
    expect(regiao.textContent).toContain("40% do total");
  });

  it("lista os 10 primeiros gastos, do mais recente ao mais antigo, e 'Mostrar mais' revela o resto", () => {
    const gastos = Array.from({ length: 12 }, (_, i) => gasto(i + 1, ["mercado"]));
    render(<DetalheDaTag barra={BARRA} gastos={gastos} aoFechar={() => {}} />);

    const itens = () => screen.getAllByRole("listitem");
    expect(itens()).toHaveLength(10);
    expect(itens()[0].textContent).toContain("Gasto 01");
    expect(itens()[0].textContent).toContain("29/06/2026");

    fireEvent.click(screen.getByRole("button", { name: "Mostrar mais" }));

    expect(itens()).toHaveLength(12);
    expect(screen.queryByRole("button", { name: "Mostrar mais" })).toBeNull();
  });

  it("mostra a categoria em texto e o valor inteiro, com a parte da tag quando há várias tags", async () => {
    render(
      <DetalheDaTag
        barra={BARRA}
        gastos={[gasto(1, ["mercado", "pix"], "10.01")]}
        aoFechar={() => {}}
      />,
    );

    const item = screen.getByRole("listitem");
    expect(item.textContent).toContain(`R$${NBSP}10,01`);
    expect(item.textContent).toContain(`R$${NBSP}5,01 nesta tag`);
    await waitFor(() => expect(item.textContent).toContain("Lazer"));
  });

  it("sem gastos diz que não há nenhum", () => {
    render(<DetalheDaTag barra={BARRA} gastos={[]} aoFechar={() => {}} />);

    expect(screen.getByText("Nenhum gasto desta tag neste mês")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("enquanto os gastos carregam, avisa", () => {
    render(<DetalheDaTag barra={BARRA} gastos={undefined} aoFechar={() => {}} />);

    expect(screen.getByText("Carregando gastos…")).toBeTruthy();
  });

  it("'Sem tag' lista os gastos sem tag", () => {
    render(
      <DetalheDaTag
        barra={{ ...BARRA, tipo: "sem_tag", rotulo: "Sem tag" }}
        gastos={[gasto(1, []), gasto(2, ["x"])]}
        aoFechar={() => {}}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Sem tag" })).toBeTruthy();
  });

  it("o botão Fechar chama aoFechar", () => {
    const aoFechar = vi.fn();
    render(<DetalheDaTag barra={BARRA} gastos={[]} aoFechar={aoFechar} />);

    fireEvent.click(screen.getByRole("button", { name: "Fechar detalhe" }));

    expect(aoFechar).toHaveBeenCalledTimes(1);
  });
});
