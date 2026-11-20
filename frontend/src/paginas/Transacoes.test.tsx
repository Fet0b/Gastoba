import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../api/cliente";
import type { Conta } from "../api/tipos";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { MENSAGEM_SEM_CONTAS } from "../componentes/Compositor/CompositorDeGasto";
import { hojeLocal } from "../periodo/periodo";
import { entrarNaSimulacao } from "../simulacao/fetchSimulado";
import { definirLayoutEstreito, definirMidia } from "../testes/preparar";
import { Transacoes } from "./Transacoes";

beforeEach(() => {
  entrarNaSimulacao();
});

function navegacao(extra: Partial<Navegacao> = {}): Navegacao {
  return { nomeDaPessoa: "Você", tela: "transacoes", aoIrPara: vi.fn(), aoSair: vi.fn(), ...extra };
}

const NBSP = "\u{a0}";

function olho(container: HTMLElement): Element {
  const elemento = container.querySelector("svg[data-estado]");
  if (!elemento) throw new Error("Olho ausente.");
  return elemento;
}

async function criarConta(nome = "Nubank", saldo_inicial = "100.00"): Promise<Conta> {
  return chamar<Conta>("/contas", { metodo: "POST", corpo: { nome, saldo_inicial } });
}

function botaoNovoGasto(): HTMLButtonElement {
  return screen.getByRole("button", { name: /Novo gasto/ }) as HTMLButtonElement;
}

/** Abre o menu "Mais ações" da linha do ganho e escolhe Excluir (abre o diálogo de confirmação). */
function abrirExclusao(lista: HTMLElement, descricao: string): void {
  fireEvent.click(within(lista).getByRole("button", { name: `Mais ações de ${descricao}` }));
  fireEvent.click(screen.getByRole("menuitem", { name: `Excluir o ganho ${descricao}` }));
}

type GrupoDeFiltro = "Contas" | "Categorias" | "Tags";

/** Abre o seletor de várias escolhas do grupo (se ainda fechado) e devolve a lista de opções. */
async function abrirSeletor(grupo: GrupoDeFiltro): Promise<HTMLElement> {
  const botao = await screen.findByRole("button", { name: new RegExp(`^${grupo}:`) });
  if (botao.getAttribute("aria-expanded") !== "true") fireEvent.click(botao);
  return screen.getByRole("group", { name: grupo });
}

/** A caixa de uma opção; espera as opções chegarem da API. */
async function opcaoDoFiltro(grupo: GrupoDeFiltro, nome: string): Promise<HTMLInputElement> {
  const lista = await abrirSeletor(grupo);
  // A conta se identifica por rótulo, tipo e final (Art. XI.5.6), não só pelo nome.
  const rotulo = grupo === "Contas" ? `${nome}, Conta corrente` : nome;
  return (await within(lista).findByRole("checkbox", { name: rotulo })) as HTMLInputElement;
}

/** Espera as contas chegarem (a opção da conta passa a existir) e deixa o seletor fechado. */
async function esperarConta(nome: string): Promise<void> {
  await opcaoDoFiltro("Contas", nome);
  fireEvent.click(screen.getByRole("button", { name: /^Contas:/ }));
}

/** Liga ou desliga uma opção do filtro, como a pessoa faz. */
async function alternarFiltro(grupo: GrupoDeFiltro, nome: string): Promise<void> {
  fireEvent.click(await opcaoDoFiltro(grupo, nome));
}

/** A seção da linha do tempo (gastos e ganhos juntos). */
function linhaDoTempo(container: HTMLElement): HTMLElement {
  return within(container).getByRole("region", { name: "Transações" });
}

function campoDeBusca(): HTMLInputElement {
  return screen.getByLabelText("Buscar transações") as HTMLInputElement;
}

async function gastar(conta_id: string, descricao: string, extra: Record<string, unknown> = {}): Promise<void> {
  await chamar("/gastos", {
    metodo: "POST",
    corpo: { conta_id, valor: "10.00", descricao, data: hojeLocal(), categoria: "lazer", tags: [], ...extra },
  });
}

async function ganhar(conta_id: string, descricao: string, extra: Record<string, unknown> = {}): Promise<void> {
  await chamar("/ganhos", {
    metodo: "POST",
    corpo: { conta_id, valor: "20.00", descricao, data: hojeLocal(), tags: [], ...extra },
  });
}

describe("Transações: cabeçalho", () => {
  it("traz o título e o subtítulo da tela pelo cabeçalho, com um só h2 Transações que nomeia a lista", async () => {
    definirMidia(true);
    const { container } = render(<Transacoes navegacao={navegacao()} />);

    const titulos = screen.getAllByRole("heading", { level: 2, name: "Transações" });
    expect(titulos).toHaveLength(1);
    expect(screen.getByText("Tudo o que entrou e saiu, dia a dia.")).not.toBeNull();
    expect(titulos[0]?.closest("[data-com-cabecalho]")).not.toBeNull();
    expect(linhaDoTempo(container).getAttribute("aria-labelledby")).toBe(titulos[0]?.id);
  });

  it("limpar a busca devolve o foco ao título da tela", async () => {
    definirMidia(true);
    await criarConta();
    render(<Transacoes navegacao={navegacao()} />);
    await esperarConta("Nubank");

    fireEvent.change(campoDeBusca(), { target: { value: "xyz" } });
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Limpar busca" }).length).toBe(2));
    fireEvent.click(screen.getAllByRole("button", { name: "Limpar busca" }).at(-1) as HTMLElement);

    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "Transações" }));
  });
});

describe("Transações: compositor de gasto", () => {
  it("registrar um gasto atualiza a lista, anuncia e o olho confirma", async () => {
    definirMidia(true);
    await criarConta();
    const { container } = render(<Transacoes navegacao={navegacao()} />);
    await esperarConta("Nubank");

    fireEvent.click(botaoNovoGasto());
    const dialogo = await screen.findByRole("dialog", { name: "Novo gasto" });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "2590" } });
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Mercado do mês" } });
    fireEvent.click(await within(dialogo).findByLabelText("Conforto"));
    fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "Pix" } });
    fireEvent.keyDown(screen.getByLabelText("Tags"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Registrar gasto" }));

    expect(await screen.findByText("Gasto registrado.")).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(olho(container).getAttribute("data-estado")).toBe("confirmando");
    const lista = linhaDoTempo(container);
    await waitFor(() => expect(lista.textContent).toContain("Mercado do mês"));
    expect(lista.textContent).toContain(`\u{2212}R$${NBSP}25,90`);
  });

  it("registrar um ganho mostra o ganho na mesma linha do tempo, com sinal de mais", async () => {
    definirMidia(true);
    await criarConta();
    const { container } = render(<Transacoes navegacao={navegacao()} />);
    await esperarConta("Nubank");

    fireEvent.click(botaoNovoGasto());
    await screen.findByRole("dialog", { name: "Novo gasto" });
    fireEvent.click(screen.getByRole("button", { name: "Ganho" }));
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "500000" } });
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Salário" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar ganho" }));

    expect(await screen.findByText("Ganho registrado.")).not.toBeNull();
    const lista = linhaDoTempo(container);
    await waitFor(() => expect(lista.textContent).toContain("Salário"));
    const linha = within(lista).getByText("Salário").closest("li[data-sentido]");
    expect(linha?.getAttribute("data-sentido")).toBe("entrada");
    expect(linha?.textContent).toContain(`+R$${NBSP}5.000,00`);
  });

  it("começa com a conta escolhida no filtro", async () => {
    await criarConta("Carteira");
    await criarConta("Nubank");
    render(<Transacoes navegacao={navegacao()} />);

    await alternarFiltro("Contas", "Nubank");
    fireEvent.click(botaoNovoGasto());
    await screen.findByRole("dialog", { name: "Novo gasto" });

    const conta = within(screen.getByRole("dialog")).getByLabelText("Conta") as HTMLSelectElement;
    expect(conta.selectedOptions[0].textContent).toBe("Nubank, Conta corrente");
  });

  it("o atalho N abre o compositor, que não reabre com N digitado dentro dele", async () => {
    await criarConta();
    render(<Transacoes navegacao={navegacao()} />);
    await esperarConta("Nubank");

    fireEvent.keyDown(window, { key: "n" });
    await screen.findByRole("dialog", { name: "Novo gasto" });

    fireEvent.keyDown(screen.getByLabelText("Descrição"), { key: "n" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("Esc fecha o compositor e devolve o foco ao botão Novo gasto", async () => {
    await criarConta();
    render(<Transacoes navegacao={navegacao()} />);
    await esperarConta("Nubank");

    botaoNovoGasto().focus();
    fireEvent.click(botaoNovoGasto());
    const dialogo = await screen.findByRole("dialog", { name: "Novo gasto" });
    fireEvent.keyDown(dialogo, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(botaoNovoGasto());

    fireEvent.keyDown(document.body, { key: "n" });
    await screen.findByRole("dialog", { name: "Novo gasto" });
  });

  it("sem contas, Novo gasto avisa e leva à tela de contas", async () => {
    const nav = navegacao();
    render(<Transacoes navegacao={nav} />);

    // Antes de as contas chegarem o botão não faz nada; repete até responder.
    await waitFor(() => {
      fireEvent.click(botaoNovoGasto());
      expect(screen.getByText(MENSAGEM_SEM_CONTAS)).not.toBeNull();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(nav.aoIrPara).toHaveBeenCalledWith("contas", { abrirFormulario: true });
  });

  it("sem contas, o atalho N também avisa e leva à tela de contas", async () => {
    const nav = navegacao();
    render(<Transacoes navegacao={nav} />);

    // Espera um sinal estável (as contas carregadas) em vez de uma única tentativa.
    await waitFor(() => {
      fireEvent.keyDown(document.body, { key: "n" });
      expect(screen.getByText(MENSAGEM_SEM_CONTAS)).not.toBeNull();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(nav.aoIrPara).toHaveBeenCalledWith("contas", { abrirFormulario: true });
  });
});

describe("Transações: filtro de conta", () => {
  it("restringe gastos e ganhos à conta escolhida e desmarcar a conta volta a todas", async () => {
    const a = await criarConta("Alfa");
    const b = await criarConta("Beta");
    for (const [conta, nome] of [[a, "Alfa"], [b, "Beta"]] as const) {
      await gastar(conta.id, `Gasto ${nome}`);
      await ganhar(conta.id, `Ganho ${nome}`);
    }
    const { container } = render(<Transacoes navegacao={navegacao()} />);
    const lista = linhaDoTempo(container);
    await waitFor(() => expect(lista.textContent).toContain("Gasto Beta"));
    await waitFor(() => expect(lista.textContent).toContain("Ganho Beta"));

    await alternarFiltro("Contas", "Alfa");
    expect((await opcaoDoFiltro("Contas", "Alfa")).checked).toBe(true);

    await waitFor(() => expect(lista.textContent).not.toContain("Gasto Beta"));
    await waitFor(() => expect(lista.textContent).not.toContain("Ganho Beta"));
    expect(lista.textContent).toContain("Gasto Alfa");
    expect(lista.textContent).toContain("Ganho Alfa");

    await alternarFiltro("Contas", "Alfa");
    await waitFor(() => expect(lista.textContent).toContain("Gasto Beta"));
  });
});

describe("Transações: barra de filtros", () => {
  it("várias contas valem juntas, aparecem como filtros ativos removíveis e Limpar filtros esvazia tudo", async () => {
    const a = await criarConta("Alfa");
    const b = await criarConta("Beta");
    const c = await criarConta("Gama");
    for (const [conta, nome] of [[a, "Alfa"], [b, "Beta"], [c, "Gama"]] as const) await gastar(conta.id, `Gasto ${nome}`);
    const { container } = render(<Transacoes navegacao={navegacao()} />);
    const lista = linhaDoTempo(container);
    await waitFor(() => expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(3));

    await alternarFiltro("Contas", "Alfa");
    await alternarFiltro("Contas", "Gama");
    await waitFor(() => expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(2));
    expect(lista.textContent).not.toContain("Gasto Beta");
    expect(screen.getByRole("button", { name: "Contas: 2" })).toBeTruthy();
    const ativos = screen.getByRole("list", { name: "Filtros ativos" });
    expect(within(ativos).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Remover filtro: Alfa, Conta corrente",
      "Remover filtro: Gama, Conta corrente",
    ]);

    fireEvent.click(within(ativos).getByRole("button", { name: "Remover filtro: Alfa, Conta corrente" }));
    await waitFor(() => expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(1));
    expect(lista.textContent).toContain("Gasto Gama");

    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(3));
    expect(screen.queryByRole("list", { name: "Filtros ativos" })).toBeNull();
  });

  it("várias categorias e várias tags valem qualquer uma delas", async () => {
    const conta = await criarConta();
    await gastar(conta.id, "Cinema", { categoria: "lazer", tags: ["pix"] });
    await gastar(conta.id, "Livro", { categoria: "conhecimento", tags: ["cartao"] });
    await gastar(conta.id, "Sofá", { categoria: "conforto", tags: ["loja"] });
    const { container } = render(<Transacoes navegacao={navegacao()} />);
    const lista = linhaDoTempo(container);
    await waitFor(() => expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(3));

    await alternarFiltro("Categorias", "Lazer");
    await alternarFiltro("Categorias", "Conforto");
    await waitFor(() => expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(2));
    expect(lista.textContent).not.toContain("Livro");

    await alternarFiltro("Tags", "loja");
    await waitFor(() => expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(1));
    expect(lista.textContent).toContain("Sofá");
  });

  it("a tecla / foca a busca, mas não digitando num campo nem com um diálogo aberto", async () => {
    await criarConta();
    render(<Transacoes navegacao={navegacao()} />);
    await screen.findByRole("button", { name: /^Contas:/ });

    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).toBe(campoDeBusca());

    fireEvent.change(campoDeBusca(), { target: { value: "a" } });
    campoDeBusca().focus();
    fireEvent.keyDown(campoDeBusca(), { key: "/" });
    expect(campoDeBusca().value).toBe("a");

    fireEvent.click(botaoNovoGasto());
    await screen.findByRole("dialog", { name: "Novo gasto" });
    campoDeBusca().blur();
    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).not.toBe(campoDeBusca());
  });
});

describe("Transações: linha do tempo, total e busca", () => {
  it("mostra gastos e ganhos do mês juntos e o total filtrado muda com a conta", async () => {
    definirMidia(true);
    const a = await criarConta("Alfa");
    const b = await criarConta("Beta");
    await gastar(a.id, "Gasto Alfa", { valor: "10.00" });
    await ganhar(a.id, "Ganho Alfa", { valor: "50.00" });
    await gastar(b.id, "Gasto Beta", { valor: "5.00" });
    const { container } = render(<Transacoes navegacao={navegacao()} />);
    const lista = linhaDoTempo(container);

    await waitFor(() => expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(3));
    const saldo = () => within(lista).getByRole("group", { name: /^Saldo/ }).textContent ?? "";
    await waitFor(() => expect(saldo()).toContain(`R$${NBSP}35,00`));

    await alternarFiltro("Contas", "Beta");
    await waitFor(() => expect(saldo()).toContain(`\u{2212}R$${NBSP}5,00`));
  });

  it("a busca filtra por descrição e por tag e atualiza o total", async () => {
    definirMidia(true);
    const conta = await criarConta();
    await gastar(conta.id, "Café da manhã", { valor: "8.00", tags: ["padaria"] });
    await gastar(conta.id, "Cinema", { valor: "40.00" });
    const { container } = render(<Transacoes navegacao={navegacao()} />);
    const lista = linhaDoTempo(container);
    await waitFor(() => expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(2));

    fireEvent.change(campoDeBusca(), { target: { value: "cafe" } });
    expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(1);
    expect(lista.textContent).toContain("Café da manhã");
    expect(within(lista).getByRole("group", { name: "Saldo da lista" }).textContent).toContain(
      `\u{2212}R$${NBSP}8,00`,
    );

    fireEvent.change(campoDeBusca(), { target: { value: "padaria" } });
    expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(1);
  });

  it("busca sem resultado mostra o estado vazio e Limpar busca restaura a lista", async () => {
    const conta = await criarConta();
    await gastar(conta.id, "Cinema");
    const { container } = render(<Transacoes navegacao={navegacao()} />);
    const lista = linhaDoTempo(container);
    await waitFor(() => expect(lista.textContent).toContain("Cinema"));

    fireEvent.change(campoDeBusca(), { target: { value: "zzz" } });
    expect(lista.textContent).not.toContain("Cinema");
    expect(lista.textContent).toContain("Nada encontrado");
    // Há dois botões com esse nome (o do campo e o do estado vazio): o do estado vazio é o último.
    const limpar = within(lista).getAllByRole("button", { name: "Limpar busca" }).at(-1);
    fireEvent.click(limpar as HTMLElement);

    expect(campoDeBusca().value).toBe("");
    expect(lista.textContent).toContain("Cinema");
  });

  it("a categoria ativa esconde os ganhos e mostra a nota; a tag vale também para os ganhos", async () => {
    definirMidia(true);
    const conta = await criarConta();
    await gastar(conta.id, "Cinema", { categoria: "lazer", tags: ["pix"] });
    await gastar(conta.id, "Livro", { categoria: "conhecimento", tags: ["cartao"] });
    await ganhar(conta.id, "Salário", { tags: ["pix"] });
    await ganhar(conta.id, "Bolsa", { tags: [] });
    const { container } = render(<Transacoes navegacao={navegacao()} />);
    const lista = linhaDoTempo(container);
    await waitFor(() => expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(4));
    expect(lista.textContent).not.toContain("não têm categoria");

    await alternarFiltro("Tags", "pix");
    await waitFor(() => expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(2));
    expect(lista.textContent).toContain("Cinema");
    expect(lista.textContent).toContain("Salário");

    await alternarFiltro("Tags", "pix");
    await waitFor(() => expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(4));

    await alternarFiltro("Categorias", "Lazer");
    await waitFor(() => expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(1));
    expect(lista.textContent).toContain("Cinema");
    expect(lista.textContent).not.toContain("Salário");
    expect(lista.textContent).toContain("Ganhos não têm categoria");
  });

  it("mais de 100 itens: Mostrar mais revela o restante", async () => {
    const conta = await criarConta("Nubank", "0.00");
    for (let i = 0; i < 101; i += 1) await gastar(conta.id, `Item ${i}`);
    const { container } = render(<Transacoes navegacao={navegacao()} />);
    const lista = linhaDoTempo(container);

    const mais = await within(lista).findByRole("button", { name: /Mostrar mais/ });
    expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(100);
    fireEvent.click(mais);
    expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(101);
  });

  it("o atalho N não abre o compositor ao digitar n na busca", async () => {
    await criarConta();
    render(<Transacoes navegacao={navegacao()} />);
    await esperarConta("Nubank");

    fireEvent.keyDown(campoDeBusca(), { key: "n" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("mês sem nada mostra o estado vazio com a ação de registrar o primeiro gasto", async () => {
    render(<Transacoes navegacao={navegacao()} />);

    expect(await screen.findByText("Nenhum gasto ou ganho neste mês")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Registrar o primeiro gasto" })).not.toBeNull();
  });
});

describe("Transações: resultado anunciado e foco", () => {
  function resultado(container: HTMLElement): string {
    return container.querySelector("[data-resultado]")?.textContent ?? "";
  }

  it("anuncia a contagem só com busca ou filtro ativos, e Nenhuma quando não há resultado", async () => {
    const conta = await criarConta();
    await gastar(conta.id, "Cinema");
    await gastar(conta.id, "Café");
    const { container } = render(<Transacoes navegacao={navegacao()} />);
    await waitFor(() => expect(linhaDoTempo(container).textContent).toContain("Cinema"));
    expect(container.querySelector("[data-resultado]")?.getAttribute("aria-live")).toBe("polite");
    expect(resultado(container)).toBe("");

    fireEvent.change(campoDeBusca(), { target: { value: "cin" } });
    expect(resultado(container)).toBe("1 transação encontrada.");
    fireEvent.change(campoDeBusca(), { target: { value: "" } });
    expect(resultado(container)).toBe("");
    fireEvent.change(campoDeBusca(), { target: { value: "zzz" } });
    expect(resultado(container)).toBe("Nenhuma transação encontrada.");
  });

  it("Limpar filtros e Limpar busca (do estado vazio) deixam o foco no título da lista", async () => {
    const conta = await criarConta();
    await gastar(conta.id, "Cinema", { categoria: "lazer" });
    const { container } = render(<Transacoes navegacao={navegacao()} />);
    const lista = linhaDoTempo(container);
    await waitFor(() => expect(lista.textContent).toContain("Cinema"));
    const titulo = screen.getByRole("heading", { level: 2, name: "Transações" });

    fireEvent.change(campoDeBusca(), { target: { value: "zzz" } });
    fireEvent.click(within(lista).getAllByRole("button", { name: "Limpar busca" }).at(-1) as HTMLElement);
    expect(document.activeElement).toBe(titulo);
    expect(lista.textContent).toContain("Cinema");

    await alternarFiltro("Categorias", "Conhecimento");
    const limparFiltros = await within(lista).findByRole("button", { name: "Limpar filtros" });
    limparFiltros.focus();
    fireEvent.click(limparFiltros);
    expect(document.activeElement).toBe(titulo);
    await waitFor(() => expect(lista.textContent).toContain("Cinema"));
  });

  it("mudar um filtro não remonta os dias que continuam (a animação não recomeça)", async () => {
    const conta = await criarConta();
    await gastar(conta.id, "Cinema", { categoria: "lazer" });
    await gastar(conta.id, "Livro", { categoria: "conhecimento" });
    const { container } = render(<Transacoes navegacao={navegacao()} />);
    const lista = linhaDoTempo(container);
    await waitFor(() => expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(2));
    const dia = lista.querySelector("ol > li");

    fireEvent.change(campoDeBusca(), { target: { value: "cin" } });
    expect(lista.querySelector("ol > li")).toBe(dia);
    await alternarFiltro("Categorias", "Lazer");
    await waitFor(() => expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(1));
    expect(lista.querySelector("ol > li")).toBe(dia);
  });

  it("depois de excluir um ganho o foco fica no título da lista", async () => {
    definirMidia(true);
    const conta = await criarConta("Nubank", "0.00");
    await ganhar(conta.id, "Errado");
    const { container } = render(<Transacoes navegacao={navegacao()} />);
    const lista = linhaDoTempo(container);
    await waitFor(() => expect(lista.textContent).toContain("Errado"));

    abrirExclusao(lista, "Errado");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));

    await waitFor(() => expect(lista.textContent).not.toContain("Errado"));
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "Transações" }));
  });
});

describe("Transações: excluir um ganho", () => {
  it("exclui o ganho registrado errado e atualiza a lista", async () => {
    definirMidia(true);
    const conta = await criarConta("Nubank", "0.00");
    await ganhar(conta.id, "Errado", { valor: "999.00" });
    const { container } = render(<Transacoes navegacao={navegacao()} />);
    const lista = linhaDoTempo(container);
    await waitFor(() => expect(lista.textContent).toContain("Errado"));

    abrirExclusao(lista, "Errado");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));

    expect(await screen.findByText("Ganho excluído.")).toBeTruthy();
    await waitFor(() => expect(lista.textContent).not.toContain("Errado"));
  });

  it("um erro ao excluir (o ganho já não existe) vai ao aviso e o botão volta", async () => {
    const conta = await criarConta("Nubank", "0.00");
    await ganhar(conta.id, "Sumiu");
    const { container } = render(<Transacoes navegacao={navegacao()} />);
    const lista = linhaDoTempo(container);
    await waitFor(() => expect(lista.textContent).toContain("Sumiu"));
    const [existente] = await chamar<{ id: string }[]>("/ganhos", {
      parametros: { inicio: "2000-01-01", fim: "2999-12-31" },
    });
    await chamar(`/ganhos/${existente.id}`, { metodo: "DELETE" });

    abrirExclusao(lista, "Sumiu");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));

    expect(await screen.findByText("Ganho não encontrado.")).toBeTruthy();
  });
});

describe("Transações: servidor fora do ar", () => {
  it("avisa, pisca o olho e depois o olho volta ao normal", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    const { container } = render(<Transacoes navegacao={navegacao()} />);

    expect(
      await screen.findByText("Não foi possível falar com o servidor. Confira se a API está rodando."),
    ).not.toBeNull();
    expect(olho(container).getAttribute("data-estado")).toBe("erro");
    await waitFor(() => expect(olho(container).getAttribute("data-estado")).toBe("normal"), {
      timeout: 2000,
    });
  });
});

describe("Transações: caixa de entrada", () => {
  it("sem importação bancária não há o seletor", () => {
    render(<Transacoes navegacao={navegacao()} />);
    expect(screen.queryByRole("button", { name: /^Caixa de entrada/ })).toBeNull();
  });

  it("a Caixa de entrada mostra quantas transações pendentes há", async () => {
    await chamar("/sincronizacoes", { metodo: "POST" });
    const pendentes = await chamar<unknown[]>("/transacoes-importadas");
    render(<Transacoes navegacao={navegacao({ importacaoBancaria: true })} />);

    const caixa = await screen.findByRole("button", { name: /^Caixa de entrada/ });
    await waitFor(() => expect(caixa.textContent).toContain(`${pendentes.length} ${pendentes.length === 1 ? "pendente" : "pendentes"}`));
  });

  it("com importação bancária o seletor troca o conteúdo pela caixa de entrada", async () => {
    const { container } = render(<Transacoes navegacao={navegacao({ importacaoBancaria: true })} />);
    const gastosEGanhos = screen.getByRole("button", { name: "Gastos e ganhos" });
    const caixa = screen.getByRole("button", { name: /^Caixa de entrada/ });
    expect(gastosEGanhos.getAttribute("aria-pressed")).toBe("true");
    expect(caixa.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(caixa);

    expect(caixa.getAttribute("aria-pressed")).toBe("true");
    expect(await within(container).findByRole("region", { name: "Caixa de entrada" })).not.toBeNull();
    expect(within(container).queryByRole("region", { name: "Transações" })).toBeNull();

    fireEvent.click(gastosEGanhos);
    expect(within(container).getByRole("region", { name: "Transações" })).not.toBeNull();
  });

  it("o atalho N, na caixa de entrada, volta aos gastos e abre o compositor", async () => {
    await criarConta();
    render(<Transacoes navegacao={navegacao({ importacaoBancaria: true })} />);
    // As contas já chegaram (senão o N não faria nada de qualquer jeito).
    await esperarConta("Nubank");
    fireEvent.click(screen.getByRole("button", { name: /^Caixa de entrada/ }));

    fireEvent.keyDown(document.body, { key: "n" });

    expect(await screen.findByRole("dialog", { name: "Novo gasto" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gastos e ganhos" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("Transações: aportes e resgates", () => {
  it.each([{ importacaoBancaria: true }, { gestaoDeInvestimentos: true }])("abre a seção disponível por %j sem busca/categoria/tag e N volta aos gastos", async (permissoes) => {
    await criarConta();
    render(<Transacoes navegacao={navegacao(permissoes)} />);
    await esperarConta("Nubank");
    fireEvent.click(screen.getByRole("button", { name: "Aportes e resgates" }));
    expect(screen.getByRole("button", { name: "Aportes e resgates" }).getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByRole("region", { name: "Movimentos de investimento" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Contas:/ })).toBeTruthy();
    expect(screen.queryByLabelText("Buscar transações")).toBeNull();
    expect(Boolean(screen.queryByRole("button", { name: /^Caixa de entrada/ }))).toBe(permissoes.importacaoBancaria === true);
    fireEvent.keyDown(document.body, { key: "n" });
    expect(await screen.findByRole("dialog", { name: "Novo gasto" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gastos e ganhos" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("vista inicial abre aportes quando disponível e recua para gastos sem permissão", async () => {
    const vista = render(<Transacoes navegacao={navegacao({ gestaoDeInvestimentos: true })} vistaInicial="aportes" />);
    expect(await screen.findByRole("region", { name: "Movimentos de investimento" })).toBeTruthy(); vista.unmount();
    render(<Transacoes navegacao={navegacao()} vistaInicial="aportes" />);
    expect(screen.getByRole("region", { name: "Transações" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Conteúdo" })).toBeNull();
  });
});

describe("Transações: filtros no celular", () => {
  it("abaixo de 45rem mostra só a busca e o botão Filtros; escolher na folha vira chip removível", async () => {
    definirMidia(true);
    definirLayoutEstreito(true);
    await criarConta();
    render(<Transacoes navegacao={navegacao()} />);

    expect(screen.queryByRole("group", { name: "Filtrar por conta" })).toBeNull();
    expect(campoDeBusca()).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Filtros" }));
    const folha = screen.getByRole("dialog", { name: "Filtros" });
    await waitFor(() => within(folha).getByRole("button", { name: "Nubank, Conta corrente" }));
    fireEvent.click(within(folha).getByRole("button", { name: "Nubank, Conta corrente" }));
    fireEvent.click(within(folha).getByRole("button", { name: "Concluir" }));

    expect(screen.getByRole("button", { name: "Filtros (1)" })).toBeTruthy();
    const ativos = screen.getByRole("list", { name: "Filtros ativos" });
    fireEvent.click(within(ativos).getByRole("button", { name: "Remover filtro: Nubank, Conta corrente" }));
    expect(screen.getByRole("button", { name: "Filtros" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Filtros ativos" })).toBeNull();
  });
});
