import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { chamar } from "../../api/cliente";
import type { Conta, Gasto, NovoGasto } from "../../api/tipos";
import { Transacoes } from "../../paginas/Transacoes";
import { hojeLocal } from "../../periodo/periodo";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";

// Filtros pelo painel inteiro, contra o fetch simulado (vazio e sem sessão a
// cada teste, pelo preparar.ts; aqui com a sessão aberta), com duas contas e
// três gastos no mês atual.

const DESCRICOES = ["Feira do mês", "Cinema", "Livro de TS"];

async function criarConta(nome: string): Promise<Conta> {
  return chamar<Conta>("/contas", { metodo: "POST", corpo: { nome, saldo_inicial: "500.00" } });
}

async function registrar(gasto: Omit<NovoGasto, "data">): Promise<Gasto> {
  return chamar<Gasto>("/gastos", { metodo: "POST", corpo: { ...gasto, data: hojeLocal() } });
}

beforeEach(async () => {
  entrarNaSimulacao();
  const nubank = await criarConta("Nubank");
  const carteira = await criarConta("Carteira");
  await registrar({
    conta_id: nubank.id,
    valor: "25.90",
    descricao: "Feira do mês",
    categoria: "conforto",
    tags: ["pix", "mercado"],
  });
  await registrar({
    conta_id: nubank.id,
    valor: "40.00",
    descricao: "Cinema",
    categoria: "lazer",
    tags: ["cartao"],
  });
  await registrar({
    conta_id: carteira.id,
    valor: "50.00",
    descricao: "Livro de TS",
    categoria: "conhecimento",
    tags: ["pix"],
  });
});

function areaDeGastos(): HTMLElement {
  return screen.getByRole("region", { name: "Transações" });
}

function filtroDeTags(): HTMLElement {
  return screen.getByRole("group", { name: "Filtrar por tag" });
}

function filtroDeCategorias(): HTMLElement {
  return screen.getByRole("group", { name: "Filtrar por categoria" });
}

/** Descrições dos gastos na lista, na ordem da tela. */
function descricoesNaLista(): string[] {
  const texto = areaDeGastos().textContent ?? "";
  return DESCRICOES.filter((descricao) => texto.includes(descricao));
}

async function painelCarregado(): Promise<void> {
  render(
    <Transacoes navegacao={{ nomeDaPessoa: "Você", tela: "transacoes", aoIrPara: () => {}, aoSair: () => {} }} />,
  );
  await waitFor(() => expect(descricoesNaLista()).toHaveLength(3));
}

describe("Filtros do painel", () => {
  it("clicar numa tag do filtro filtra a lista e clicar de novo limpa", async () => {
    await painelCarregado();

    const mercado = await within(filtroDeTags()).findByRole("button", { name: "mercado" });
    fireEvent.click(mercado);
    expect(mercado.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(descricoesNaLista()).toEqual(["Feira do mês"]));

    fireEvent.click(mercado);
    expect(mercado.getAttribute("aria-pressed")).toBe("false");
    await waitFor(() => expect(descricoesNaLista()).toHaveLength(3));
  });

  it("clicar numa tag de uma linha filtra pela mesma tag; clicar de novo limpa", async () => {
    await painelCarregado();

    const linha = within(areaDeGastos()).getByText("Livro de TS").closest("li");
    if (!linha) throw new Error("Linha sem item.");
    fireEvent.click(within(linha).getByRole("button", { name: "Filtrar pela tag pix" }));

    await waitFor(() => expect(descricoesNaLista()).toEqual(["Feira do mês", "Livro de TS"]));
    const pixNoFiltro = await within(filtroDeTags()).findByRole("button", { name: "pix" });
    expect(pixNoFiltro.getAttribute("aria-pressed")).toBe("true");

    const pixNaLinha = within(areaDeGastos()).getAllByRole("button", { name: "Filtrar pela tag pix" })[0];
    expect(pixNaLinha.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(pixNaLinha);
    await waitFor(() => expect(descricoesNaLista()).toHaveLength(3));
  });

  it("clicar na categoria de uma linha filtra por ela; a ativa fica pressionada", async () => {
    await painelCarregado();

    const linha = within(areaDeGastos()).getByText("Cinema").closest("li");
    if (!linha) throw new Error("Linha sem item.");
    fireEvent.click(within(linha).getByRole("button", { name: "Filtrar por Lazer" }));

    await waitFor(() => expect(descricoesNaLista()).toEqual(["Cinema"]));
    const lazerNoFiltro = await within(filtroDeCategorias()).findByRole("button", { name: /Lazer/ });
    expect(lazerNoFiltro.getAttribute("aria-pressed")).toBe("true");
  });

  it("clicar numa categoria filtra a lista e clicar de novo limpa", async () => {
    await painelCarregado();

    const lazer = within(filtroDeCategorias()).getByRole("button", { name: "Lazer" });
    fireEvent.click(lazer);
    expect(lazer.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(descricoesNaLista()).toEqual(["Cinema"]));

    fireEvent.click(lazer);
    await waitFor(() => expect(descricoesNaLista()).toHaveLength(3));
  });

  it("escolher uma conta filtra a lista e Todas as contas limpa", async () => {
    await painelCarregado();

    const contas = screen.getByRole("group", { name: "Filtrar por conta" });
    fireEvent.click(await within(contas).findByRole("button", { name: "Carteira" }));
    await waitFor(() => expect(descricoesNaLista()).toEqual(["Livro de TS"]));

    fireEvent.click(within(contas).getByRole("button", { name: "Todas as contas" }));
    await waitFor(() => expect(descricoesNaLista()).toHaveLength(3));
  });

  it("Limpar só aparece com filtro ativo e limpa o filtro", async () => {
    await painelCarregado();
    await within(filtroDeTags()).findByRole("button", { name: "pix" });

    expect(within(filtroDeTags()).queryByRole("button", { name: /Limpar/ })).toBeNull();
    expect(within(filtroDeCategorias()).queryByRole("button", { name: /Limpar/ })).toBeNull();

    fireEvent.click(within(filtroDeTags()).getByRole("button", { name: "cartao" }));
    fireEvent.click(within(filtroDeCategorias()).getByRole("button", { name: "Lazer" }));
    await waitFor(() => expect(descricoesNaLista()).toEqual(["Cinema"]));

    fireEvent.click(within(filtroDeTags()).getByRole("button", { name: /Limpar/ }));
    expect(within(filtroDeTags()).queryByRole("button", { name: /Limpar/ })).toBeNull();
    fireEvent.click(within(filtroDeCategorias()).getByRole("button", { name: /Limpar/ }));
    expect(within(filtroDeCategorias()).queryByRole("button", { name: /Limpar/ })).toBeNull();
    await waitFor(() => expect(descricoesNaLista()).toHaveLength(3));
  });

  it("trocar para um mês sem gastos mostra o estado vazio", async () => {
    await painelCarregado();

    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));

    expect(await screen.findByText("Nenhum gasto ou ganho neste mês")).not.toBeNull();
    expect(descricoesNaLista()).toEqual([]);
  });

  it("a troca de mês mantém os filtros, e Limpar filtros volta a lista inteira", async () => {
    await painelCarregado();

    fireEvent.click(within(filtroDeCategorias()).getByRole("button", { name: "Lazer" }));
    await waitFor(() => expect(descricoesNaLista()).toEqual(["Cinema"]));

    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    expect(await within(areaDeGastos()).findByText("Nenhuma transação com esses filtros")).not.toBeNull();
    const limparFiltros = within(areaDeGastos()).getByRole("button", { name: "Limpar filtros" });
    const lazer = within(filtroDeCategorias()).getByRole("button", { name: "Lazer" });
    expect(lazer.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(limparFiltros);
    expect(lazer.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    await waitFor(() => expect(descricoesNaLista()).toHaveLength(3));
  });
});
