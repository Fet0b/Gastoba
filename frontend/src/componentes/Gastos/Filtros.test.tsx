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

type Grupo = "Contas" | "Categorias" | "Tags";

/** A caixa de uma opção do seletor de várias escolhas (abre o seletor se estiver fechado). */
async function opcao(grupo: Grupo, nome: string): Promise<HTMLInputElement> {
  const botao = await screen.findByRole("button", { name: new RegExp(`^${grupo}:`) });
  if (botao.getAttribute("aria-expanded") !== "true") fireEvent.click(botao);
  const lista = screen.getByRole("group", { name: grupo });
  return (await within(lista).findByRole("checkbox", { name: nome })) as HTMLInputElement;
}

async function alternar(grupo: Grupo, nome: string): Promise<void> {
  fireEvent.click(await opcao(grupo, nome));
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
  it("marcar uma tag do filtro filtra a lista e desmarcar limpa", async () => {
    await painelCarregado();

    await alternar("Tags", "mercado");
    expect((await opcao("Tags", "mercado")).checked).toBe(true);
    await waitFor(() => expect(descricoesNaLista()).toEqual(["Feira do mês"]));

    await alternar("Tags", "mercado");
    expect((await opcao("Tags", "mercado")).checked).toBe(false);
    await waitFor(() => expect(descricoesNaLista()).toHaveLength(3));
  });

  it("clicar numa tag de uma linha filtra pela mesma tag; clicar de novo limpa", async () => {
    await painelCarregado();

    const linha = within(areaDeGastos()).getByText("Livro de TS").closest("li");
    if (!linha) throw new Error("Linha sem item.");
    fireEvent.click(within(linha).getByRole("button", { name: "Filtrar pela tag pix" }));

    await waitFor(() => expect(descricoesNaLista()).toEqual(["Feira do mês", "Livro de TS"]));
    expect((await opcao("Tags", "pix")).checked).toBe(true);

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
    expect((await opcao("Categorias", "Lazer")).checked).toBe(true);
  });

  it("marcar uma categoria filtra a lista e desmarcar limpa", async () => {
    await painelCarregado();

    await alternar("Categorias", "Lazer");
    await waitFor(() => expect(descricoesNaLista()).toEqual(["Cinema"]));

    await alternar("Categorias", "Lazer");
    await waitFor(() => expect(descricoesNaLista()).toHaveLength(3));
  });

  it("escolher uma conta filtra a lista e desmarcar a conta volta a todas", async () => {
    await painelCarregado();

    await alternar("Contas", "Carteira, Conta corrente");
    await waitFor(() => expect(descricoesNaLista()).toEqual(["Livro de TS"]));

    await alternar("Contas", "Carteira, Conta corrente");
    await waitFor(() => expect(descricoesNaLista()).toHaveLength(3));
  });

  it("Limpar filtros só aparece com filtro ativo e limpa todos de uma vez", async () => {
    await painelCarregado();
    await opcao("Tags", "pix");

    expect(screen.queryByRole("button", { name: "Limpar filtros" })).toBeNull();

    await alternar("Tags", "cartao");
    await alternar("Categorias", "Lazer");
    await waitFor(() => expect(descricoesNaLista()).toEqual(["Cinema"]));

    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.queryByRole("button", { name: "Limpar filtros" })).toBeNull();
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

    await alternar("Categorias", "Lazer");
    await waitFor(() => expect(descricoesNaLista()).toEqual(["Cinema"]));

    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    expect(await within(areaDeGastos()).findByText("Nenhuma transação com esses filtros")).not.toBeNull();
    const limparFiltros = within(areaDeGastos()).getByRole("button", { name: "Limpar filtros" });
    expect((await opcao("Categorias", "Lazer")).checked).toBe(true);

    fireEvent.click(limparFiltros);
    expect((await opcao("Categorias", "Lazer")).checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    await waitFor(() => expect(descricoesNaLista()).toHaveLength(3));
  });
});
