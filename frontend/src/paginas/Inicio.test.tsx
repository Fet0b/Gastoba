import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../api/cliente";
import type { Conta } from "../api/tipos";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { formatar, somar } from "../dinheiro/dinheiro";
import { anterior, hojeLocal, periodoAtual, proximo, rotulo } from "../periodo/periodo";
import { entrarNaSimulacao } from "../simulacao/fetchSimulado";
import { Inicio } from "./Inicio";

beforeEach(() => {
  entrarNaSimulacao();
});

afterEach(() => {
  vi.useRealTimers();
});

const NBSP = "\u{a0}";
const MENOS = "\u{2212}";

function navegacao(): Navegacao {
  return { nomeDaPessoa: "Você", tela: "inicio", aoIrPara: vi.fn(), aoSair: vi.fn() };
}

async function preparar(): Promise<Conta> {
  const conta = await chamar<Conta>("/contas", {
    metodo: "POST",
    corpo: { nome: "Nubank", saldo_inicial: "0.00" },
  });
  const data = hojeLocal();
  await chamar("/ganhos", {
    metodo: "POST",
    corpo: { conta_id: conta.id, valor: "1000.10", descricao: "Salário", data, tags: [] },
  });
  for (const [valor, descricao] of [["25.90", "Mercado"], ["0.05", "Bala"]]) {
    await chamar("/gastos", {
      metodo: "POST",
      corpo: { conta_id: conta.id, valor, descricao, data, categoria: "lazer", tags: [] },
    });
  }
  return conta;
}

function destaque(container: HTMLElement, nome: RegExp | string): HTMLElement {
  return within(container).getByRole("group", { name: nome });
}

async function gasto(conta: Conta, valor: string, descricao: string, data = hojeLocal()): Promise<void> {
  await chamar("/gastos", {
    metodo: "POST",
    corpo: { conta_id: conta.id, valor, descricao, data, categoria: "lazer", tags: [] },
  });
}

describe("Início", () => {
  it("vive na moldura: navegação, link de pular, main e um só h1", () => {
    render(<Inicio navegacao={navegacao()} />);
    expect(screen.getByRole("navigation", { name: "Telas" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Pular para o conteúdo" })).not.toBeNull();
    expect(screen.getByRole("main")).not.toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Período" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Novo gasto/ })).toBeNull();
  });

  it("o destaque principal é quanto ainda dá para gastar, em centavos exatos", async () => {
    await preparar();
    const { container } = render(<Inicio navegacao={navegacao()} />);

    await waitFor(() =>
      expect(destaque(container, /^Pode gastar este mês/).textContent).toContain(`R$${NBSP}974,15`),
    );
    expect(container.textContent).not.toContain("Ganhos do mês");
    expect(container.textContent).not.toContain("Diferença");
  });

  it("gastos acima da renda mostram o sinal de menos e a palavra Negativo", async () => {
    const conta = await preparar();
    await gasto(conta, "2000.00", "Reforma");
    const { container } = render(<Inicio navegacao={navegacao()} />);

    await waitFor(() => expect(destaque(container, /^Pode gastar este mês/).getAttribute("data-tom")).toBe("negativo"));
    const principal = destaque(container, /^Pode gastar este mês/);
    expect(principal.textContent).toContain(`${MENOS}R$${NBSP}1.025,85`);
    expect(principal.textContent).toContain("Negativo");
  });

  it("sem ganhos mostra Gasto no mês e o botão leva às Transações", async () => {
    const conta = await chamar<Conta>("/contas", { metodo: "POST", corpo: { nome: "Nubank", saldo_inicial: "0.00" } });
    await gasto(conta, "25.90", "Mercado");
    const nav = navegacao();
    const { container } = render(<Inicio navegacao={nav} />);

    await waitFor(() => expect(destaque(container, /^Gasto no mês/).textContent).toContain(`R$${NBSP}25,90`));
    expect(container.textContent).not.toContain("Pode gastar este mês");
    fireEvent.click(within(container).getByRole("button", { name: "Registrar um ganho" }));
    expect(nav.aoIrPara).toHaveBeenCalledWith("transacoes");
  });

  it("o dinheiro total soma só as contas correntes, nunca os cartões", async () => {
    await chamar<Conta>("/contas", { metodo: "POST", corpo: { nome: "Carteira", saldo_inicial: "100.00" } });
    await chamar<Conta>("/contas", { metodo: "POST", corpo: { nome: "Nubank", saldo_inicial: "50.50" } });
    const { container } = render(<Inicio navegacao={navegacao()} />);

    await waitFor(() => expect(destaque(container, /^Dinheiro total/).textContent).toContain(`R$${NBSP}150,50`));
  });

  it("o cartão de crédito importado não entra no dinheiro total", async () => {
    await chamar("/sincronizacoes", { metodo: "POST" });
    const contas = await chamar<Conta[]>("/contas");
    expect(contas.some((conta) => conta.tipo === "cartao")).toBe(true);
    const esperado = formatar(somar(contas.filter((conta) => conta.tipo === "corrente").map((conta) => conta.saldo)));
    const { container } = render(<Inicio navegacao={navegacao()} />);

    await waitFor(() => expect(destaque(container, /^Dinheiro total/).textContent).toContain(esperado));
  });

  it("os últimos gastos são cinco linhas, e Ver todas leva às Transações", async () => {
    const conta = await preparar();
    for (let n = 1; n <= 4; n += 1) await gasto(conta, "1.00", `Extra ${n}`);
    const nav = navegacao();
    const { container } = render(<Inicio navegacao={nav} />);

    const bloco = within(container).getByRole("region", { name: "Últimos gastos" });
    await waitFor(() => expect(within(bloco).getAllByRole("listitem")).toHaveLength(5));
    fireEvent.click(within(bloco).getByRole("button", { name: "Ver todas" }));
    expect(nav.aoIrPara).toHaveBeenCalledWith("transacoes");
  });

  it("sem gastos no mês, os últimos gastos mostram o estado vazio", async () => {
    const { container } = render(<Inicio navegacao={navegacao()} />);

    const bloco = within(container).getByRole("region", { name: "Últimos gastos" });
    await within(bloco).findByText("Nenhum gasto neste mês");
  });

  it("a ordem dos blocos: resumo, metas, ritmo, últimos gastos e aviso", async () => {
    await preparar();
    await chamar("/metas/lazer", { metodo: "PUT", corpo: { percentual: 3 } });
    const { container } = render(<Inicio navegacao={navegacao()} />);
    await screen.findByRole("status");

    const nomes = ["Resumo do mês", "Metas do mês", "Ritmo do mês", "Últimos gastos"];
    const blocos = nomes.map((nome) => within(container).getByRole("region", { name: nome }));
    const aviso = screen.getByRole("status");
    const ordem = [...blocos, aviso];
    for (let i = 0; i < ordem.length - 1; i += 1) {
      expect(ordem[i].compareDocumentPosition(ordem[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(within(blocos[1]).getByRole("heading", { name: "Metas do mês" })).not.toBeNull();
  });

  it("mostra o gráfico de ritmo com o gasto acumulado do mês", async () => {
    await preparar();
    render(<Inicio navegacao={navegacao()} />);

    const grafico = await screen.findByRole("img", { name: /^Gasto acumulado/ });
    expect(grafico.getAttribute("aria-label")).toContain(`R$${NBSP}25,95`);
  });

  it("uma meta em alerta faz aparecer um único status com ícone", async () => {
    await preparar();
    await chamar("/metas/lazer", { metodo: "PUT", corpo: { percentual: 3 } });
    const { container } = render(<Inicio navegacao={navegacao()} />);

    // Renda 1000,10; 3% = 30,00; gasto 25,95 = 86% do limite.
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Lazer a 86% da meta");
    expect(status.querySelector("svg")).not.toBeNull();
    expect(within(container).getAllByRole("status")).toHaveLength(1);

  });

  it("meta dentro do limite não gera aviso", async () => {
    await preparar();
    await chamar("/metas/lazer", { metodo: "PUT", corpo: { percentual: 10 } });
    const { container } = render(<Inicio navegacao={navegacao()} />);

    await within(container).findByRole("progressbar", { name: "Meta de Lazer" });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("mostra as metas do mês, sem o botão de filtrar por categoria", async () => {
    await preparar();
    await chamar("/metas/lazer", { metodo: "PUT", corpo: { percentual: 10 } });
    const { container } = render(<Inicio navegacao={navegacao()} />);

    const bloco = within(container).getByRole("region", { name: "Metas do mês" });
    await within(bloco).findByRole("progressbar", { name: "Meta de Lazer" });
    expect(bloco.textContent).not.toContain("Ver gastos de");
  });

  it("Ver orçamento leva à tela de orçamento", async () => {
    const nav = navegacao();
    const { container } = render(<Inicio navegacao={nav} />);

    const bloco = within(container).getByRole("region", { name: "Metas do mês" });
    fireEvent.click(await within(bloco).findByRole("button", { name: "Ver orçamento" }));
    expect(nav.aoIrPara).toHaveBeenCalledWith("orcamento");
  });

  it("mês anterior troca o rótulo para Sobrou no mês", async () => {
    const conta = await chamar<Conta>("/contas", { metodo: "POST", corpo: { nome: "Nubank", saldo_inicial: "0.00" } });
    const antes = anterior(periodoAtual());
    const data = `${antes.ano}-${String(antes.mes).padStart(2, "0")}-05`;
    await chamar("/ganhos", {
      metodo: "POST",
      corpo: { conta_id: conta.id, valor: "500.00", descricao: "Salário", data, tags: [] },
    });
    const { container } = render(<Inicio navegacao={navegacao()} />);

    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));

    await waitFor(() => expect(destaque(container, /^Sobrou no mês/).textContent).toContain(`R$${NBSP}500,00`));
  });

  it("mês futuro: o gráfico vira estado vazio e sem ganhos é Gasto no mês", async () => {
    const { container } = render(<Inicio navegacao={navegacao()} />);

    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));

    expect(screen.getByText(rotulo(proximo(periodoAtual())))).not.toBeNull();
    await screen.findByText("Este mês ainda não começou");
    await waitFor(() => expect(destaque(container, /^Gasto no mês/).textContent).toContain(`R$${NBSP}0,00`));
  });

  it("mês passado: a curva cobre o mês inteiro", async () => {
    const conta = await chamar<Conta>("/contas", { metodo: "POST", corpo: { nome: "Nubank", saldo_inicial: "0.00" } });
    const antes = anterior(periodoAtual());
    const mes = String(antes.mes).padStart(2, "0");
    await gasto(conta, "10.00", "Antigo", `${antes.ano}-${mes}-05`);
    render(<Inicio navegacao={navegacao()} />);

    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));

    const dias = new Date(antes.ano, antes.mes, 0).getDate();
    const grafico = await screen.findByRole("img", { name: new RegExp(`até o dia ${dias}\\.`) });
    expect(grafico.getAttribute("aria-label")).toContain(`R$${NBSP}10,00`);
  });

  it("gasto com data futura dentro do mês corrente entra na curva", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 10, 12));
    const conta = await chamar<Conta>("/contas", { metodo: "POST", corpo: { nome: "Nubank", saldo_inicial: "0.00" } });
    await gasto(conta, "40.00", "Adiantado", "2026-10-20");
    render(<Inicio navegacao={navegacao()} />);

    const grafico = await screen.findByRole("img", { name: /^Gasto acumulado/ });
    expect(grafico.getAttribute("aria-label")).toContain(`R$${NBSP}40,00 até o dia 20`);
  });
});
