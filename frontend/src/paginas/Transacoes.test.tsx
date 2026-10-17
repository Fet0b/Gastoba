import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../api/cliente";
import type { Conta } from "../api/tipos";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { MENSAGEM_SEM_CONTAS } from "../componentes/Compositor/CompositorDeGasto";
import { hojeLocal } from "../periodo/periodo";
import { entrarNaSimulacao } from "../simulacao/fetchSimulado";
import { definirMidia } from "../testes/preparar";
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

function chipsDeConta(): HTMLElement {
  return screen.getByRole("group", { name: "Filtrar por conta" });
}

function chipDeConta(nome: string): HTMLElement {
  return within(chipsDeConta()).getByRole("button", { name: nome });
}

/** Espera as contas chegarem: o chip da conta passa a existir. */
async function esperarConta(nome: string): Promise<void> {
  await waitFor(() => chipDeConta(nome));
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
    await esperarConta("Nubank");

    fireEvent.click(chipDeConta("Nubank"));
    fireEvent.click(botaoNovoGasto());
    await screen.findByRole("dialog", { name: "Novo gasto" });

    const conta = within(screen.getByRole("dialog")).getByLabelText("Conta") as HTMLSelectElement;
    expect(conta.selectedOptions[0].textContent).toBe("Nubank");
  });

  it("o atalho N abre o compositor, que não reabre com N digitado dentro dele", async () => {
    await criarConta();
    render(<Transacoes navegacao={navegacao()} />);
    await esperarConta("Nubank");

    fireEvent.keyDown(document.body, { key: "n" });
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
  it("restringe gastos e ganhos à conta escolhida e Todas as contas limpa", async () => {
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
    await esperarConta("Beta");

    fireEvent.click(chipDeConta("Alfa"));
    expect(chipDeConta("Alfa").getAttribute("aria-pressed")).toBe("true");

    await waitFor(() => expect(lista.textContent).not.toContain("Gasto Beta"));
    await waitFor(() => expect(lista.textContent).not.toContain("Ganho Beta"));
    expect(lista.textContent).toContain("Gasto Alfa");
    expect(lista.textContent).toContain("Ganho Alfa");

    fireEvent.click(chipDeConta("Todas as contas"));
    await waitFor(() => expect(lista.textContent).toContain("Gasto Beta"));
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
    const saldo = () => within(lista).getByText("Saldo").nextElementSibling?.textContent ?? "";
    await waitFor(() => expect(saldo()).toContain(`R$${NBSP}35,00`));

    fireEvent.click(chipDeConta("Beta"));
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
    expect(within(lista).getByText("Saldo").nextElementSibling?.textContent).toContain(
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

    const tags = await screen.findByRole("group", { name: "Filtrar por tag" });
    fireEvent.click(within(tags).getByRole("button", { name: "pix" }));
    await waitFor(() => expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(2));
    expect(lista.textContent).toContain("Cinema");
    expect(lista.textContent).toContain("Salário");

    fireEvent.click(within(tags).getByRole("button", { name: "pix" }));
    await waitFor(() => expect(lista.querySelectorAll("li[data-sentido]")).toHaveLength(4));

    const categorias = screen.getByRole("group", { name: "Filtrar por categoria" });
    fireEvent.click(within(categorias).getByRole("button", { name: "Lazer" }));
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

  it("mês sem nada mostra o estado vazio com a dica do N", async () => {
    render(<Transacoes navegacao={navegacao()} />);

    expect(await screen.findByText("Nenhum gasto ou ganho neste mês")).not.toBeNull();
    expect(screen.getByText(/Registre o primeiro com N/)).not.toBeNull();
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
    const titulo = within(lista).getByRole("heading", { level: 2, name: "Transações" });

    fireEvent.change(campoDeBusca(), { target: { value: "zzz" } });
    fireEvent.click(within(lista).getAllByRole("button", { name: "Limpar busca" }).at(-1) as HTMLElement);
    expect(document.activeElement).toBe(titulo);
    expect(lista.textContent).toContain("Cinema");

    const categorias = screen.getByRole("group", { name: "Filtrar por categoria" });
    fireEvent.click(within(categorias).getByRole("button", { name: "Conhecimento" }));
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
    const categorias = screen.getByRole("group", { name: "Filtrar por categoria" });
    fireEvent.click(within(categorias).getByRole("button", { name: "Lazer" }));
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

    fireEvent.click(within(lista).getByRole("button", { name: "Excluir o ganho Errado" }));
    fireEvent.click(within(lista).getByRole("button", { name: "Confirmar exclusão" }));

    await waitFor(() => expect(lista.textContent).not.toContain("Errado"));
    expect(document.activeElement).toBe(within(lista).getByRole("heading", { level: 2 }));
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

    fireEvent.click(within(lista).getByRole("button", { name: "Excluir o ganho Errado" }));
    fireEvent.click(within(lista).getByRole("button", { name: "Confirmar exclusão" }));

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

    fireEvent.click(within(lista).getByRole("button", { name: "Excluir o ganho Sumiu" }));
    fireEvent.click(within(lista).getByRole("button", { name: "Confirmar exclusão" }));

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
    expect(screen.queryByRole("button", { name: "Caixa de entrada" })).toBeNull();
  });

  it("com importação bancária o seletor troca o conteúdo pela caixa de entrada", async () => {
    const { container } = render(<Transacoes navegacao={navegacao({ importacaoBancaria: true })} />);
    const gastosEGanhos = screen.getByRole("button", { name: "Gastos e ganhos" });
    const caixa = screen.getByRole("button", { name: "Caixa de entrada" });
    expect(gastosEGanhos.getAttribute("aria-pressed")).toBe("true");
    expect(caixa.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(caixa);

    expect(caixa.getAttribute("aria-pressed")).toBe("true");
    expect(await within(container).findByRole("region", { name: "Caixa de entrada" })).not.toBeNull();
    expect(within(container).queryByRole("region", { name: "Transações" })).toBeNull();

    fireEvent.click(gastosEGanhos);
    expect(within(container).getByRole("region", { name: "Transações" })).not.toBeNull();
  });

  it("o atalho N fica desligado na caixa de entrada", async () => {
    await criarConta();
    render(<Transacoes navegacao={navegacao({ importacaoBancaria: true })} />);
    // As contas já chegaram (senão o N não faria nada de qualquer jeito).
    await esperarConta("Nubank");
    fireEvent.click(screen.getByRole("button", { name: "Caixa de entrada" }));

    fireEvent.keyDown(document.body, { key: "n" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
