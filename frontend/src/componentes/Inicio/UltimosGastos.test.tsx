import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Categoria, Conta, Gasto } from "../../api/tipos";
import { UltimosGastos } from "./UltimosGastos";

const CONTAS = [{ id: "c1", nome: "Nubank" }] as Conta[];
const CATEGORIAS: Categoria[] = [{ codigo: "lazer", nome: "Lazer", legada: false }];

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
    valor_coberto: "0.00", coberturas: [],
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

  it("com tags, mostra cada tag num Badge próprio abaixo da descrição", () => {
    desenhar([{ ...gasto(1, "2026-10-01"), tags: ["mercado", "pix"], descricao: "PIX TRANSF JOAO" }]);
    const linha = screen.getByRole("listitem");
    const principal = linha.querySelector("[data-descricao]") as HTMLElement;
    const secundaria = linha.querySelector("[data-secundaria]") as HTMLElement;
    const badges = Array.from(secundaria.querySelectorAll("[data-badge]")).map((b) => b.textContent);
    expect(badges).toEqual(["mercado", "pix"]);
    expect(principal.textContent).not.toContain("\u{b7}");
    expect(principal.textContent).toBe("PIX TRANSF JOAO");
    expect(principal.nextElementSibling).toBe(secundaria);
    expect(linha.getAttribute("aria-label")).toContain("mercado, pix, PIX TRANSF JOAO");
  });

  it("sem tag, mostra a descrição e nenhum texto secundário", () => {
    desenhar([gasto(1, "2026-10-01")]);
    const linha = screen.getByRole("listitem");
    expect(linha.querySelector("[data-descricao]")?.textContent).toBe("Gasto 1");
    expect(linha.querySelector("[data-secundaria]")).toBeNull();
    expect(linha.getAttribute("aria-label")).not.toContain("\u{b7}");
  });

  it("dez tags viram dez Badges e ficam inteiras no title (o corte é visual)", () => {
    const tags = Array.from({ length: 10 }, (_, i) => `tag-comprida-${i}`);
    desenhar([{ ...gasto(1, "2026-10-01"), tags }]);
    const principal = screen.getByRole("listitem").querySelector("[data-secundaria]") as HTMLElement;
    expect(principal.querySelectorAll("[data-badge]")).toHaveLength(10);
    expect(principal.getAttribute("title")).toBe(tags.join(", "));
  });

  it("gasto recorrente leva o Badge Recorrente; o avulso não", () => {
    desenhar([{ ...gasto(1, "2026-10-01"), recorrencia_id: "r1" }, gasto(2, "2026-10-02")]);
    const [avulso, recorrente] = screen.getAllByRole("listitem");
    expect(within(recorrente).getByText("Recorrente").closest("[data-badge]")).not.toBeNull();
    expect(within(avulso).queryByText("Recorrente")).toBeNull();
  });

  it("Ver todas chama a ação", () => {
    const { aoVerTodas } = desenhar([gasto(1, "2026-10-01")]);

    const botao = screen.getByRole("button", { name: "Ver todas" });
    expect(botao.getAttribute("data-papel")).toBe("terciaria");
    fireEvent.click(botao);
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

  it("é uma lista de cinco itens com o nome acessível de cada linha e cabeçalhos aria-hidden fora dela", () => {
    const { container } = render(
      <UltimosGastos
        gastos={[1, 2, 3, 4, 5, 6].map((n) => gasto(n, `2026-10-0${n}`))}
        carregando={false}
        contas={CONTAS}
        categorias={CATEGORIAS}
        aoVerTodas={() => {}}
      />,
    );

    const lista = screen.getByRole("list");
    expect(within(lista).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("listitem", { name: /^Saída de R\$.10,00, Gasto 6, Lazer, Nubank$/ })).toBeTruthy();
    const cabecalho = container.querySelector("[data-cabecalho]") as HTMLElement;
    expect(cabecalho.getAttribute("aria-hidden")).toBe("true");
    expect(lista.contains(cabecalho)).toBe(false);
    expect(cabecalho.textContent).toContain("Descrição");
    expect(cabecalho.textContent).toContain("Valor");
  });

  it("cada linha traz o selo da categoria, a conta, a data curta e o valor com sinal", () => {
    desenhar([gasto(1, "2026-10-09")]);

    const linha = screen.getByRole("listitem");
    const selo = linha.querySelector("[data-selo]") as HTMLElement;
    expect(selo.textContent).toBe("Lazer");
    expect(selo.querySelector("[data-badge]")).not.toBeNull();
    expect(selo.querySelector("[aria-hidden]")).not.toBeNull();
    expect(linha.querySelector("[data-conta]")?.textContent).toBe("Nubank");
    expect(linha.querySelector("[data-data]")?.textContent).toBe("09/10");
    expect(linha.querySelector("[data-valor]")?.textContent).toBe(`\u{2212}R$\u{a0}10,00`);
  });
});
