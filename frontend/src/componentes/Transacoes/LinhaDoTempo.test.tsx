import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Categoria, Conta, Ganho, Gasto } from "../../api/tipos";
import { juntarTransacoes, TAMANHO_DA_PAGINA } from "../../transacoes/linhaDoTempo";
import { LinhaDoTempo } from "./LinhaDoTempo";

// Relógio fixado em 10/10/2026 (sábado) para "Hoje" e "Ontem".

const NBSP = "\u{a0}";
const CONTAS: Conta[] = [
  { id: "c1", nome: "Nubank", saldo: "0.00", origem: "manual", tipo: "corrente" },
];
const CATEGORIAS: Categoria[] = [
  { codigo: "conforto", nome: "Conforto" },
  { codigo: "lazer", nome: "Lazer" },
];

function gasto(descricao: string, data: string, extra: Partial<Gasto> = {}): Gasto {
  return {
    id: `g-${descricao}`, conta_id: "c1", valor: "10.00", descricao, data, categoria: "conforto",
    tags: [], origem: "manual", recorrencia_id: null, ...extra,
  };
}

function ganho(descricao: string, data: string, extra: Partial<Ganho> = {}): Ganho {
  return {
    id: `n-${descricao}`, conta_id: "c1", valor: "5000.00", descricao, data,
    tags: [], origem: "manual", recorrencia_id: null, ...extra,
  };
}

function montar(gastos: Gasto[], ganhos: Ganho[], extra: Partial<Parameters<typeof LinhaDoTempo>[0]> = {}) {
  return render(
    <LinhaDoTempo
      transacoes={juntarTransacoes(gastos, ganhos)}
      contas={CONTAS}
      categorias={CATEGORIAS}
      aoExcluirGanho={vi.fn().mockResolvedValue(true)}
      {...extra}
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 10, 12, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LinhaDoTempo", () => {
  it("é um só ol, com um h3 por dia (Hoje, Ontem e o dia da semana), gastos e ganhos juntos", () => {
    const { container } = montar(
      [gasto("Padaria", "2026-10-10"), gasto("Uber", "2026-10-09"), gasto("Cinema", "2026-10-02")],
      [ganho("Salário", "2026-10-10")],
    );

    expect(container.querySelectorAll("ol")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Hoje",
      "Ontem",
      "sexta, 2 de outubro",
    ]);
    const hoje = screen.getByRole("heading", { name: "Hoje" }).closest("li");
    const textos = [...(hoje?.querySelectorAll(":scope > ul > li") ?? [])].map((li) => li.textContent);
    expect(textos).toHaveLength(2);
    // No mesmo dia, a saída vem antes da entrada.
    expect(textos[0]).toContain("Padaria");
    expect(textos[0]).toContain(`\u{2212}R$${NBSP}10,00`);
    expect(textos[1]).toContain("Salário");
    expect(textos[1]).toContain(`+R$${NBSP}5.000,00`);
  });

  it("mostra conta e categoria do gasto; categoria desconhecida mostra o código", () => {
    montar([gasto("Mercado", "2026-10-10"), gasto("Passagem", "2026-10-10", { categoria: "viagem" })], []);

    const mercado = screen.getByText("Mercado").closest("li");
    expect(mercado?.textContent).toContain("Nubank");
    expect(mercado?.textContent).toContain("Conforto");
    expect(screen.getByText("Passagem").closest("li")?.textContent).toContain("viagem");
  });

  it("conta fora da lista não quebra: o ganho mostra só a descrição", () => {
    montar([], [ganho("Salário", "2026-10-05", { conta_id: "removida" })]);

    const linha = screen.getByText("Salário").closest("li");
    expect(linha?.textContent).not.toContain("·");
  });

  it("marca como Recorrente o que veio de uma recorrência e só ele", () => {
    montar(
      [gasto("Aluguel", "2026-10-05", { recorrencia_id: "r2" })],
      [ganho("Bolsa", "2026-10-05", { recorrencia_id: "r1" }), ganho("Avulso", "2026-10-06")],
    );

    expect(screen.getAllByText("Recorrente")).toHaveLength(2);
    expect(screen.getByText("Avulso").closest("li")?.textContent).not.toContain("Recorrente");
  });

  it("só o ganho avulso tem o botão Excluir; o de recorrência e o gasto não", () => {
    montar(
      [gasto("Aluguel", "2026-10-05")],
      [ganho("Bolsa", "2026-10-05", { recorrencia_id: "r1" }), ganho("Avulso", "2026-10-06")],
    );

    expect(screen.getAllByRole("button", { name: /Excluir/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Excluir o ganho Avulso" })).toBeTruthy();
  });

  it("excluir passa o ganho a aoExcluirGanho depois da confirmação", async () => {
    const aoExcluirGanho = vi.fn().mockResolvedValue(true);
    const avulso = ganho("Avulso", "2026-10-06");
    montar([], [avulso], { aoExcluirGanho });

    fireEvent.click(screen.getByRole("button", { name: "Excluir o ganho Avulso" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));

    await vi.waitFor(() => expect(aoExcluirGanho).toHaveBeenCalledWith(expect.objectContaining({ id: avulso.id })));
  });

  it("pagina de 100 em 100: Mostrar mais revela o restante", () => {
    const muitos = Array.from({ length: TAMANHO_DA_PAGINA + 5 }, (_, i) =>
      gasto(`Item ${String(i).padStart(3, "0")}`, "2026-10-10"),
    );
    const { container } = montar(muitos, []);

    expect(container.querySelectorAll("li[data-sentido]")).toHaveLength(TAMANHO_DA_PAGINA);
    const mais = screen.getByRole("button", { name: /Mostrar mais/ });
    expect(mais.textContent).toContain("5");

    fireEvent.click(mais);
    expect(container.querySelectorAll("li[data-sentido]")).toHaveLength(TAMANHO_DA_PAGINA + 5);
    expect(screen.queryByRole("button", { name: /Mostrar mais/ })).toBeNull();
  });

  it("até 100 itens não há Mostrar mais", () => {
    montar([gasto("Um", "2026-10-10")], []);

    expect(screen.queryByRole("button", { name: /Mostrar mais/ })).toBeNull();
    expect(within(document.body).getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("reiniciarQuando volta às 100 primeiras sem remontar o dia", () => {
    const muitos = Array.from({ length: TAMANHO_DA_PAGINA + 5 }, (_, i) =>
      gasto(`Item ${String(i).padStart(3, "0")}`, "2026-10-10"),
    );
    const transacoes = juntarTransacoes(muitos, []);
    const props = { transacoes, contas: CONTAS, categorias: CATEGORIAS, aoExcluirGanho: vi.fn() };
    const { container, rerender } = render(<LinhaDoTempo {...props} reiniciarQuando="a" />);
    const dia = container.querySelector("ol > li");
    fireEvent.click(screen.getByRole("button", { name: /Mostrar mais/ }));
    expect(container.querySelectorAll("li[data-sentido]")).toHaveLength(TAMANHO_DA_PAGINA + 5);

    rerender(<LinhaDoTempo {...props} reiniciarQuando="a" />);
    expect(container.querySelectorAll("li[data-sentido]")).toHaveLength(TAMANHO_DA_PAGINA + 5);

    rerender(<LinhaDoTempo {...props} reiniciarQuando="b" />);
    expect(container.querySelectorAll("li[data-sentido]")).toHaveLength(TAMANHO_DA_PAGINA);
    expect(container.querySelector("ol > li")).toBe(dia);
  });

  it("o dia mais recente vem primeiro, qualquer que seja a ordem de entrada dos gastos", () => {
    const { container } = montar([gasto("Antigo", "2026-10-01"), gasto("Novo", "2026-10-09")], []);

    const dias = [...container.querySelectorAll("ol > li")].map((li) => li.textContent);
    expect(dias[0]).toContain("Novo");
    expect(dias[1]).toContain("Antigo");
  });

  it("cada clique em Mostrar mais revela mais 100 e a contagem restante bate (singular com 1)", () => {
    const muitos = Array.from({ length: 2 * TAMANHO_DA_PAGINA + 1 }, (_, i) =>
      gasto(`Item ${String(i).padStart(3, "0")}`, "2026-10-10"),
    );
    const { container } = montar(muitos, []);

    expect(screen.getByRole("button", { name: /Mostrar mais/ }).textContent).toBe(
      "Mostrar mais (101 restantes)",
    );
    fireEvent.click(screen.getByRole("button", { name: /Mostrar mais/ }));
    expect(container.querySelectorAll("li[data-sentido]")).toHaveLength(2 * TAMANHO_DA_PAGINA);
    expect(screen.getByRole("button", { name: /Mostrar mais/ }).textContent).toBe(
      "Mostrar mais (1 restante)",
    );
    fireEvent.click(screen.getByRole("button", { name: /Mostrar mais/ }));
    expect(container.querySelectorAll("li[data-sentido]")).toHaveLength(2 * TAMANHO_DA_PAGINA + 1);
  });

  it("com os filtros ligados, só a categoria conhecida e as tags viram botões; a ativa fica pressionada", () => {
    const aoAlternarCategoria = vi.fn();
    const aoAlternarTag = vi.fn();
    montar(
      [
        gasto("Mercado", "2026-10-10", { tags: ["pix"] }),
        gasto("Passagem", "2026-10-10", { categoria: "viagem" }),
      ],
      [],
      { aoAlternarCategoria, aoAlternarTag, categoriaAtiva: "conforto", tagAtiva: "pix" },
    );

    const categoria = screen.getByRole("button", { name: "Filtrar por Conforto" });
    expect(categoria.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(categoria);
    expect(aoAlternarCategoria).toHaveBeenCalledWith("conforto");
    expect(screen.queryByRole("button", { name: /Filtrar por viagem/ })).toBeNull();
    const pix = screen.getByRole("button", { name: "Filtrar pela tag pix" });
    expect(pix.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(pix);
    expect(aoAlternarTag).toHaveBeenCalledWith("pix");
  });
});
