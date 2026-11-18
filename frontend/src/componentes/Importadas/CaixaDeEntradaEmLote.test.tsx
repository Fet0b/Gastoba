import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { chamar } from "../../api/cliente";
import type { Gasto, Investimento, Sincronizacao } from "../../api/tipos";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { Aviso, type MensagemDoAviso } from "../Aviso/Aviso";
import { CaixaDeEntrada } from "./CaixaDeEntrada";

beforeEach(() => {
  entrarNaSimulacao();
});

const PERIODO_LARGO = { inicio: "2000-01-01", fim: "2999-12-31" };

function ComAviso() {
  const [mensagem, definirMensagem] = useState<MensagemDoAviso | null>(null);
  return (
    <>
      <CaixaDeEntrada
        aoAvisar={(tipo, texto) => definirMensagem({ tipo, texto })}
        aoSinalizarOlho={() => {}}
      />
      <Aviso mensagem={mensagem} aoDispensar={() => definirMensagem(null)} />
    </>
  );
}

/** Sincroniza (a simulação cria também um investimento de exemplo) e abre a caixa. */
async function abrir(): Promise<void> {
  await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
  render(<ComAviso />);
  await screen.findByRole("listitem", { name: "Mercado Extra" });
}

const painel = () => screen.getByRole("region", { name: "Aceitar em lote" });

describe("aceitar em lote", () => {
  it("só as saídas têm caixa de seleção, e a seleção abre o painel do lote", async () => {
    await abrir();

    expect(screen.queryByLabelText(/Selecionar para aceitar em lote: Salário/)).toBeNull();
    expect(screen.queryByRole("region", { name: "Aceitar em lote" })).toBeNull();
    fireEvent.click(screen.getByLabelText("Selecionar para aceitar em lote: Farmácia"));

    expect(within(painel()).getByText("1 saída selecionada")).toBeTruthy();
    expect(
      (within(painel()).getByRole("button", { name: "Aceitar 1 como gasto" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(within(painel()).getByText("Escolha a categoria para aceitar como gasto.")).toBeTruthy();
  });

  it("categoriza todas as saídas de uma vez, com a mesma categoria e as mesmas tags", async () => {
    await abrir();

    fireEvent.click(screen.getByLabelText(/Selecionar todas as saídas/));
    expect(within(painel()).getByText("2 saídas selecionadas")).toBeTruthy();
    fireEvent.click(within(painel()).getByLabelText("Lazer"));
    fireEvent.click(within(painel()).getByRole("button", { name: "Adicionar tags a todas" }));
    const campo = within(painel()).getByRole("combobox");
    fireEvent.change(campo, { target: { value: "Pix" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    fireEvent.click(within(painel()).getByRole("button", { name: "Aceitar 2 como gastos" }));

    expect(await screen.findByText("2 gastos criados.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("listitem", { name: "Farmácia" })).toBeNull());
    expect(screen.queryByRole("region", { name: "Aceitar em lote" })).toBeNull();
    const gastos = await chamar<Gasto[]>("/gastos", { parametros: PERIODO_LARGO });
    expect(gastos.map((g) => [g.descricao, g.categoria, g.tags]).sort()).toEqual([
      ["Farmácia", "lazer", ["pix"]],
      ["Mercado Extra", "lazer", ["pix"]],
    ]);
    // As entradas continuam esperando.
    expect(screen.getByRole("listitem", { name: "Salário" })).toBeTruthy();
  });

  it("Limpar seleção fecha o painel sem aceitar nada", async () => {
    await abrir();
    fireEvent.click(screen.getByLabelText("Selecionar para aceitar em lote: Farmácia"));

    fireEvent.click(within(painel()).getByRole("button", { name: "Limpar seleção" }));

    expect(screen.queryByRole("region", { name: "Aceitar em lote" })).toBeNull();
    expect(screen.getByRole("listitem", { name: "Farmácia" })).toBeTruthy();
  });

  it("aceita várias como aporte, dividindo entre as destinações", async () => {
    await abrir();
    fireEvent.click(screen.getByLabelText(/Selecionar todas as saídas/));

    fireEvent.click(within(painel()).getByRole("button", { name: "Aporte em investimento" }));
    const investimentos = await chamar<Investimento[]>("/investimentos");
    fireEvent.change(within(painel()).getByLabelText("Investimento"), {
      target: { value: investimentos[0].id },
    });
    fireEvent.change(within(painel()).getByLabelText("Tag da destinação 1"), {
      target: { value: "Reserva" },
    });
    fireEvent.click(within(painel()).getByRole("button", { name: "Aceitar 2 como aportes" }));

    expect(await screen.findByText("2 aportes registrados.")).toBeTruthy();
    const depois = await chamar<Investimento[]>("/investimentos");
    expect(depois[0].destinacoes.map((d) => [d.tag, d.principal])).toEqual([["reserva", "133.25"]]);
    expect(await chamar<Gasto[]>("/gastos", { parametros: PERIODO_LARGO })).toEqual([]);
  });

  it("o aporte pede percentuais que somam 100 antes de aceitar", async () => {
    await abrir();
    fireEvent.click(screen.getByLabelText("Selecionar para aceitar em lote: Farmácia"));
    fireEvent.click(within(painel()).getByRole("button", { name: "Aporte em investimento" }));
    const investimentos = await chamar<Investimento[]>("/investimentos");
    fireEvent.change(within(painel()).getByLabelText("Investimento"), {
      target: { value: investimentos[0].id },
    });

    fireEvent.change(within(painel()).getByLabelText("Percentual da destinação 1"), {
      target: { value: "50" },
    });

    expect(within(painel()).getByText("Soma: 50%")).toBeTruthy();
    expect(
      (within(painel()).getByRole("button", { name: "Aceitar 1 como aporte" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe("aporte e resgate numa transação só", () => {
  it("aceita a saída como aporte e mostra quanto cabe a cada destinação", async () => {
    await abrir();
    const item = screen.getByRole("listitem", { name: "Mercado Extra" });
    const investimentos = await chamar<Investimento[]>("/investimentos");

    fireEvent.click(within(item).getByRole("radio", { name: "Aporte" }));
    fireEvent.change(within(item).getByLabelText("Investimento"), {
      target: { value: investimentos[0].id },
    });
    fireEvent.change(within(item).getByLabelText("Tag da destinação 1"), {
      target: { value: "viagem" },
    });
    fireEvent.change(within(item).getByLabelText("Percentual da destinação 1"), {
      target: { value: "60" },
    });
    fireEvent.click(within(item).getByRole("button", { name: "Adicionar destinação" }));
    fireEvent.change(within(item).getByLabelText("Tag da destinação 2"), {
      target: { value: "casa" },
    });
    fireEvent.change(within(item).getByLabelText("Percentual da destinação 2"), {
      target: { value: "40" },
    });
    expect(item.textContent).toContain("Soma: 100%");
    fireEvent.click(within(item).getByRole("button", { name: /Aceitar como aporte/ }));

    expect(await screen.findByText("Aporte registrado.")).toBeTruthy();
    const depois = await chamar<Investimento[]>("/investimentos");
    expect(depois[0].destinacoes.map((d) => [d.tag, d.principal]).sort()).toEqual([
      ["casa", "34.94"],
      ["viagem", "52.41"],
    ]);
  });

  it("a entrada vira resgate, sem ganho", async () => {
    await abrir();
    const item = screen.getByRole("listitem", { name: "Salário" });

    fireEvent.click(within(item).getByRole("radio", { name: "Resgate" }));
    fireEvent.click(within(item).getByRole("button", { name: /Aceitar como resgate/ }));

    expect(await screen.findByText("Resgate registrado.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("listitem", { name: "Salário" })).toBeNull());
  });
});

describe("dividir uma transação em partes", () => {
  it("divide a saída por porcentagem, mostra quanto cabe a cada parte e cria um gasto por parte", async () => {
    await abrir();
    const item = screen.getByRole("listitem", { name: "Farmácia" });

    fireEvent.click(within(item).getByRole("button", { name: "Dividir em partes" }));
    // A categoria única some: cada parte tem a sua.
    expect(within(item).queryByLabelText("Conforto")).toBeNull();
    fireEvent.change(within(item).getByLabelText("Categoria da parte 1"), {
      target: { value: "conforto" },
    });
    fireEvent.change(within(item).getByLabelText("Categoria da parte 2"), {
      target: { value: "lazer" },
    });
    fireEvent.change(within(item).getByLabelText("Percentual da parte 1"), {
      target: { value: "70" },
    });
    fireEvent.change(within(item).getByLabelText("Percentual da parte 2"), {
      target: { value: "30" },
    });
    fireEvent.change(within(item).getByLabelText(/Tags da parte 2/), { target: { value: "Cinema, pix" } });

    expect(item.textContent).toContain("Tudo distribuído");
    expect(item.textContent).toContain("32,13");
    expect(item.textContent).toContain("13,77");
    fireEvent.click(within(item).getByRole("button", { name: /Salvar divisão/ }));

    expect(await screen.findByText("Transação dividida em 2 lançamentos.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("listitem", { name: "Farmácia" })).toBeNull());
    const gastos = await chamar<Gasto[]>("/gastos", { parametros: PERIODO_LARGO });
    expect(gastos.map((g) => [g.descricao, g.valor, g.categoria, g.tags]).sort()).toEqual([
      ["Farmácia (1/2)", "32.13", "conforto", []],
      ["Farmácia (2/2)", "13.77", "lazer", ["cinema", "pix"]],
    ]);
  });

  it("só deixa aceitar com categoria em cada parte e soma 100", async () => {
    await abrir();
    const item = screen.getByRole("listitem", { name: "Farmácia" });
    fireEvent.click(within(item).getByRole("button", { name: "Dividir em partes" }));
    const aceitar = within(item).getByRole("button", { name: /Salvar divisão/ }) as HTMLButtonElement;

    expect(aceitar.disabled).toBe(true);
    // O erro aparece junto ao campo, depois de sair dele (não enquanto digita).
    expect(within(item).queryByText("Escolha a categoria")).toBeNull();
    fireEvent.blur(within(item).getByLabelText("Categoria da parte 1"));
    expect(within(item).getByText("Escolha a categoria")).toBeTruthy();
    fireEvent.change(within(item).getByLabelText("Categoria da parte 1"), { target: { value: "lazer" } });
    fireEvent.change(within(item).getByLabelText("Categoria da parte 2"), { target: { value: "lazer" } });
    fireEvent.change(within(item).getByLabelText("Percentual da parte 2"), { target: { value: "40" } });
    expect(within(item).getByText(/^Falta/)).toBeTruthy();
    expect(within(item).queryByText(/Tudo distribuído/)).toBeNull();
    expect(aceitar.disabled).toBe(true);
    fireEvent.click(within(item).getByRole("button", { name: "Adicionar parte" }));
    expect(within(item).getByLabelText("Percentual da parte 3")).toBeTruthy();
    fireEvent.click(within(item).getByRole("button", { name: "Mais ações da parte 3" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remover a parte 3" }));
    expect(within(item).queryByLabelText("Percentual da parte 3")).toBeNull();
  });

  it("a entrada se divide em ganhos, sem categoria", async () => {
    await abrir();
    const item = screen.getByRole("listitem", { name: "Salário" });

    fireEvent.click(within(item).getByRole("button", { name: "Dividir em partes" }));
    expect(within(item).queryByLabelText("Categoria da parte 1")).toBeNull();
    fireEvent.click(within(item).getByRole("button", { name: /Salvar divisão/ }));

    expect(await screen.findByText("Transação dividida em 2 lançamentos.")).toBeTruthy();
  });
});
