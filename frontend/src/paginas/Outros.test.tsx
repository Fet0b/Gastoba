import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../api/cliente";
import type { Conta, Ganho, Gasto, Recorrencia } from "../api/tipos";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { entrarNaSimulacao } from "../simulacao/fetchSimulado";
import { Outros } from "./Outros";

// Contra o fetch simulado (vazio e sem sessão a cada teste, pelo preparar.ts;
// aqui com a sessão aberta).
beforeEach(() => {
  entrarNaSimulacao();
});

const NBSP = "\u{a0}";
const MENOS = "\u{2212}";

function navegacao(): Navegacao {
  return { nomeDaPessoa: "Você", tela: "outros", aoIrPara: vi.fn(), aoSair: vi.fn() };
}

async function conta(nome = "Nubank", saldo_inicial = "0.00"): Promise<Conta> {
  return chamar<Conta>("/contas", { metodo: "POST", corpo: { nome, saldo_inicial } });
}

const PERIODO_LARGO = { inicio: "2000-01-01", fim: "2999-12-31" };

async function ganhos(): Promise<Ganho[]> {
  return chamar<Ganho[]>("/ganhos", { parametros: PERIODO_LARGO });
}

async function gastos(): Promise<Gasto[]> {
  return chamar<Gasto[]>("/gastos", { parametros: PERIODO_LARGO });
}

function preencher({ valor = "500000", descricao = "Salário", dia = "5", inicio = "2999-01-01" } = {}): void {
  fireEvent.change(screen.getByLabelText("Valor"), { target: { value: valor } });
  fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: descricao } });
  fireEvent.change(screen.getByLabelText("Dia do mês"), { target: { value: dia } });
  fireEvent.change(screen.getByLabelText("Começa em"), { target: { value: inicio } });
}

const botaoCriar = () => screen.getByRole("button", { name: "Criar recorrência" }) as HTMLButtonElement;

async function abrir(): Promise<void> {
  render(<Outros navegacao={navegacao()} />);
  fireEvent.click(await screen.findByRole("button", { name: /Nova recorrência|Criar recorrência/ }));
  await screen.findByRole("option", { name: "Nubank, Conta corrente" });
}

/** O formulário é um diálogo modal: quem vai mexer na lista precisa fechá-lo antes. */
function fecharFormulario(): void {
  fireEvent.click(within(screen.getByRole("dialog", { name: "Nova recorrência" })).getByRole("button", { name: "Cancelar" }));
}

/** Abre o menu "Mais ações" da recorrência e escolhe "Encerrar"; o diálogo de confirmação abre. */
function pedirEncerramento(descricao: string): void {
  fireEvent.click(screen.getByRole("button", { name: `Mais ações da recorrência ${descricao}` }));
  fireEvent.click(screen.getByRole("menuitem", { name: `Encerrar a recorrência ${descricao}` }));
}

describe("Recorrências", () => {
  it("sem recorrências, mostra um só estado vazio que leva ao formulário", async () => {
    await conta();
    render(<Outros navegacao={navegacao()} />);

    expect(await screen.findByText("Nenhuma recorrência ainda")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Recorrências" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2, name: "Suas recorrências" })).toBeNull();
    expect(screen.queryByRole("form", { name: /Nova recorrência|Criar recorrência/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Criar recorrência" }));

    expect(await screen.findByRole("form", { name: /Nova recorrência|Criar recorrência/ })).toBeTruthy();
    expect(screen.queryByText("Nenhuma recorrência ainda")).toBeNull();
  });

  it("a explicação vira uma Dica no cabeçalho e 'Cancelar' fecha o formulário devolvendo o foco", async () => {
    await conta();
    render(<Outros navegacao={navegacao()} />);
    await screen.findByText("Nenhuma recorrência ainda");

    const dica = screen.getByRole("button", { name: "Sobre as recorrências" });
    const texto = document.getElementById(dica.getAttribute("aria-describedby") ?? "");
    expect(texto?.textContent).toBe("O Gastoba cria o ganho ou o gasto de cada mês sozinho, no dia combinado.");

    fireEvent.click(screen.getByRole("button", { name: /Nova recorrência|Criar recorrência/ }));
    await screen.findByRole("form", { name: /Nova recorrência|Criar recorrência/ });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: /Nova recorrência|Criar recorrência/ })));
    expect(await screen.findByText("Nenhuma recorrência ainda")).toBeTruthy();
  });

  it("tem cabeçalho com subtítulo, um só h1 e a lista com cabeçalho visual aria-hidden", async () => {
    const c = await conta();
    await chamar("/recorrencias", {
      metodo: "POST",
      corpo: {
        tipo: "gasto",
        conta_id: c.id,
        valor: "1500.00",
        descricao: "Aluguel",
        dia_do_mes: 5,
        inicio: "2999-01-01",
        categoria: "gasto_fixo",
        tags: [],
      },
    });
    render(<Outros navegacao={navegacao()} />);

    const titulo = await screen.findByRole("heading", { level: 2, name: "Recorrências" });
    expect(titulo.closest("header")?.querySelector("p")?.textContent).toBe("O que se repete todo mês.");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const lista = await screen.findByRole("list", { name: "Recorrências" });
    const cabecalho = lista.previousElementSibling;
    expect(cabecalho?.hasAttribute("data-cabecalho-da-lista")).toBe(true);
    expect(cabecalho?.getAttribute("aria-hidden")).toBe("true");
  });

  it("o botão fica desabilitado, com os motivos, até o formulário estar completo", async () => {
    await conta();
    await abrir();

    expect(botaoCriar().disabled).toBe(true);
    expect(screen.getByText("Informe um valor maior que zero.")).toBeTruthy();
    expect(screen.getByText("Escreva uma descrição.")).toBeTruthy();

    preencher();

    expect(botaoCriar().disabled).toBe(false);
  });

  it("sem contas explica que é preciso criar uma antes", async () => {
    render(<Outros navegacao={navegacao()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Nova recorrência|Criar recorrência/ }));

    expect(await screen.findByText("Crie uma conta antes de criar uma recorrência.")).toBeTruthy();
    expect(botaoCriar().disabled).toBe(true);
  });

  it("cria o salário (ganho) e ele aparece na lista como entrada", async () => {
    await conta();
    await abrir();

    preencher({ valor: "500000", descricao: "Salário", dia: "5" });
    fireEvent.click(botaoCriar());

    expect(await screen.findByText("Recorrência criada.")).toBeTruthy();
    const lista = await screen.findByRole("list", { name: "Recorrências" });
    const item = within(lista).getByRole("listitem", { name: "Salário" });
    expect(item.textContent).toContain(`+R$${NBSP}5.000,00`);
    expect(item.textContent).toContain("todo dia 5");
    expect(item.textContent).toContain("Ativa");
    // Criada a recorrência, o formulário se fecha.
    expect(screen.queryByRole("form", { name: /Nova recorrência|Criar recorrência/ })).toBeNull();
  });

  it("início no passado gera os meses vencidos e a conta sobe", async () => {
    const c = await conta();
    await abrir();

    expect(screen.queryByText(/os meses já vencidos serão criados agora/)).toBeNull();
    preencher({ valor: "100000", inicio: "2026-01-01", dia: "1" });
    expect(screen.getByText(/os meses já vencidos serão criados agora/)).toBeTruthy();
    fireEvent.click(botaoCriar());

    await screen.findByText("Recorrência criada.");
    const criados = await ganhos();
    expect(criados.length).toBeGreaterThanOrEqual(1);
    const contas = await chamar<Conta[]>("/contas");
    expect(contas.find((x) => x.id === c.id)?.saldo).toMatch(/^\d+\.00$/);
    expect(contas[0].saldo).toBe(`${criados.length * 1000}.00`);
  });

  it("recorrência de gasto exige categoria e cria o gasto fixo", async () => {
    await conta("Nubank", "5000.00");
    await abrir();

    fireEvent.click(screen.getByRole("radio", { name: "Gasto" }));
    preencher({ valor: "150000", descricao: "Aluguel", dia: "10", inicio: "2026-10-01" });
    expect(screen.getByText("Escolha uma categoria.")).toBeTruthy();
    expect(botaoCriar().disabled).toBe(true);
    fireEvent.click(await screen.findByLabelText("Gasto fixo"));
    fireEvent.click(botaoCriar());

    await screen.findByText("Recorrência criada.");
    const item = within(await screen.findByRole("list", { name: "Recorrências" })).getByRole("listitem", { name: "Aluguel" });
    expect(item.textContent).toContain("Gasto fixo");
    expect(item.textContent).toContain(`${MENOS}R$${NBSP}1.500,00`);
    expect((await gastos()).every((g) => g.categoria === "gasto_fixo")).toBe(true);
  });

  it("dia do mês fora de 1 a 31 e fim antes do início bloqueiam o envio", async () => {
    await conta();
    await abrir();
    preencher({ dia: "32" });
    expect(screen.getByText("Informe o dia do mês, de 1 a 31.")).toBeTruthy();
    expect(botaoCriar().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Dia do mês"), { target: { value: "31" } });
    fireEvent.change(screen.getByLabelText("Termina em (opcional)"), { target: { value: "2998-01-01" } });
    expect(screen.getByText("O fim não pode ser antes do início.")).toBeTruthy();
    expect(botaoCriar().disabled).toBe(true);
  });

  it("erro da API aparece no formulário e nada é criado", async () => {
    await conta();
    await abrir();

    preencher({ inicio: "2000-01-01" }); // mais de 5 anos no passado
    fireEvent.click(botaoCriar());

    expect((await screen.findByRole("alert")).textContent).toContain("mais de 5 anos");
    expect(await chamar<Recorrencia[]>("/recorrencias")).toEqual([]);
  });

  it("encerra depois de confirmar: fica na lista como encerrada, sem botão", async () => {
    const c = await conta();
    await chamar("/recorrencias", {
      metodo: "POST",
      corpo: { tipo: "ganho", conta_id: c.id, valor: "10.00", descricao: "Bolsa", dia_do_mes: 5, inicio: "2999-01-01" },
    });
    await abrir();
    const item = await screen.findByRole("listitem", { name: "Bolsa" });

    fecharFormulario();
    pedirEncerramento("Bolsa");
    expect(screen.getByRole("dialog").textContent).toContain("o que já foi criado continua");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar encerramento" }));

    expect(await screen.findByText("Recorrência encerrada.")).toBeTruthy();
    await waitFor(() => expect(within(item).getByText("Encerrada")).toBeTruthy());
    expect(within(item).queryByRole("button", { name: /Mais ações/ })).toBeNull();
  });

  it("cancelar o encerramento não encerra", async () => {
    const c = await conta();
    await chamar("/recorrencias", {
      metodo: "POST",
      corpo: { tipo: "ganho", conta_id: c.id, valor: "10.00", descricao: "Bolsa", dia_do_mes: 5, inicio: "2999-01-01" },
    });
    await abrir();
    const item = await screen.findByRole("listitem", { name: "Bolsa" });

    fecharFormulario();
    pedirEncerramento("Bolsa");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));

    expect(within(item).getByText("Ativa")).toBeTruthy();
    expect((await chamar<Recorrencia[]>("/recorrencias"))[0].ativa).toBe(true);
  });
});

describe("Recorrências: tags e alteração", () => {
  async function criarGastoFixo(c: Conta, extra: Record<string, unknown> = {}): Promise<Recorrencia> {
    return chamar<Recorrencia>("/recorrencias", {
      metodo: "POST",
      corpo: {
        tipo: "gasto",
        conta_id: c.id,
        valor: "1500.00",
        descricao: "Aluguel",
        dia_do_mes: 5,
        inicio: "2999-01-01",
        categoria: "gasto_fixo",
        tags: ["casa"],
        ...extra,
      },
    });
  }

  function digitarTag(texto: string): void {
    const campo = screen.getByLabelText("Tags");
    fireEvent.change(campo, { target: { value: texto } });
    fireEvent.keyDown(campo, { key: "Enter" });
  }

  it("cria a recorrência com as tags escolhidas", async () => {
    await conta();
    await abrir();
    preencher();

    digitarTag("Salário Fixo");
    fireEvent.click(botaoCriar());

    expect(await screen.findByText("Recorrência criada.")).toBeTruthy();
    expect((await chamar<Recorrencia[]>("/recorrencias"))[0].tags).toEqual(["salário fixo"]);
    const item = await screen.findByRole("listitem", { name: "Salário" });
    expect(item.textContent).toContain("Tags: salário fixo");
  });

  it("tag digitada e não confirmada bloqueia o botão, com o motivo", async () => {
    await conta();
    await abrir();
    preencher();

    fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "pix" } });

    expect(botaoCriar().disabled).toBe(true);
  });

  it("a edição abre em um diálogo com campos-base e Cancelar o fecha", async () => {
    const c = await conta();
    await criarGastoFixo(c);
    await abrir();
    const item = await screen.findByRole("listitem", { name: "Aluguel" });

    fireEvent.click(within(item).getByRole("button", { name: "Alterar a recorrência Aluguel" }));
    const dialogo = screen.getByRole("dialog", { name: "Alterar recorrência" });
    expect(within(dialogo).getByRole("form", { name: "Alterar a recorrência Aluguel" })).toBeTruthy();
    expect(within(dialogo).getByLabelText("Valor")).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog", { name: "Alterar recorrência" })).toBeNull();
  });

  it("altera valor, descrição, dia e tags pela lista e anuncia", async () => {
    const c = await conta();
    await criarGastoFixo(c);
    await abrir();
    const item = await screen.findByRole("listitem", { name: "Aluguel" });

    fireEvent.click(within(item).getByRole("button", { name: "Alterar a recorrência Aluguel" }));
    const formulario = within(item).getByRole("form", { name: "Alterar a recorrência Aluguel" });
    fireEvent.change(within(formulario).getByLabelText("Valor"), { target: { value: "180000" } });
    fireEvent.change(within(formulario).getByLabelText("Descrição"), { target: { value: "Aluguel novo" } });
    fireEvent.change(within(formulario).getByLabelText("Dia do mês"), { target: { value: "10" } });
    const campoTags = within(formulario).getByLabelText("Tags");
    fireEvent.change(campoTags, { target: { value: "contrato" } });
    fireEvent.keyDown(campoTags, { key: "Enter" });
    fireEvent.click(within(formulario).getByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByText("Recorrência alterada.")).toBeTruthy();
    const [alterada] = await chamar<Recorrencia[]>("/recorrencias");
    expect(alterada).toMatchObject({
      valor: "1800.00",
      descricao: "Aluguel novo",
      dia_do_mes: 10,
      tags: ["casa", "contrato"],
      categoria: "gasto_fixo",
    });
    await waitFor(() => expect(screen.queryByRole("form", { name: /Alterar a recorrência/ })).toBeNull());
    expect(await screen.findByRole("listitem", { name: "Aluguel novo" })).toBeTruthy();
  });

  it("a edição começa com os dados atuais, não altera nada ao cancelar e devolve o foco ao botão", async () => {
    const c = await conta();
    await criarGastoFixo(c);
    await abrir();
    const item = await screen.findByRole("listitem", { name: "Aluguel" });

    fireEvent.click(within(item).getByRole("button", { name: "Alterar a recorrência Aluguel" }));
    const formulario = within(item).getByRole("form", { name: "Alterar a recorrência Aluguel" });
    expect((within(formulario).getByLabelText("Descrição") as HTMLInputElement).value).toBe("Aluguel");
    expect((within(formulario).getByLabelText("Dia do mês") as HTMLInputElement).value).toBe("5");
    fireEvent.click(within(formulario).getByRole("button", { name: "Cancelar" }));

    expect(within(item).queryByRole("form")).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(item).getByRole("button", { name: "Alterar a recorrência Aluguel" }),
      ),
    );
    expect((await chamar<Recorrencia[]>("/recorrencias"))[0].descricao).toBe("Aluguel");
  });

  it("dados inválidos ficam junto ao campo e o formulário continua aberto", async () => {
    const c = await conta();
    await criarGastoFixo(c);
    await abrir();
    const item = await screen.findByRole("listitem", { name: "Aluguel" });

    fireEvent.click(within(item).getByRole("button", { name: "Alterar a recorrência Aluguel" }));
    const formulario = within(item).getByRole("form", { name: "Alterar a recorrência Aluguel" });
    fireEvent.change(within(formulario).getByLabelText("Termina em (opcional)"), {
      target: { value: "2998-01-01" },
    });

    expect(within(formulario).getByText("O fim não pode ser antes do início.")).toBeTruthy();
    expect((within(formulario).getByRole("button", { name: "Salvar alterações" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("recorrência encerrada não tem o botão Alterar", async () => {
    const c = await conta();
    const r = await criarGastoFixo(c);
    await chamar(`/recorrencias/${r.id}`, { metodo: "DELETE" });
    await abrir();
    const item = await screen.findByRole("listitem", { name: "Aluguel" });

    expect(within(item).queryByRole("button", { name: /Alterar/ })).toBeNull();
  });

  it("os gastos e ganhos gerados carregam o recorrencia_id na simulação", async () => {
    const c = await conta();
    const r = await chamar<Recorrencia>("/recorrencias", {
      metodo: "POST",
      corpo: { tipo: "ganho", conta_id: c.id, valor: "100.00", descricao: "Bolsa", dia_do_mes: 1, inicio: `${new Date().getFullYear() - 1}-01-01` },
    });

    const gerados = await ganhos();

    expect(gerados.length).toBeGreaterThan(0);
    expect(gerados.every((g) => g.recorrencia_id === r.id)).toBe(true);
  });
});


describe("Outros: total comprometido e próximos lançamentos", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function fingirHoje(): void {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 16, 12, 0, 0));
  }

  const grupoDoTotal = () => screen.getByRole("group", { name: /^Comprometido por mês/ });
  const agenda = () => screen.queryByRole("list", { name: "Próximos lançamentos" });

  it("sem recorrências, só o estado vazio: sem total nem agenda", async () => {
    await conta();
    render(<Outros navegacao={navegacao()} />);

    expect(await screen.findByText("Nenhuma recorrência ainda")).toBeTruthy();
    expect(screen.queryByRole("group", { name: /^Comprometido por mês/ })).toBeNull();
    expect(screen.queryByText("Nada agendado para os próximos 30 dias")).toBeNull();
    expect(agenda()).toBeNull();
  });

  it("criar uma recorrência atualiza o total e a agenda", async () => {
    fingirHoje();
    await conta();
    await abrir();

    preencher({ valor: "500000", descricao: "Salário", dia: "20", inicio: "2026-10-01" });
    fireEvent.click(botaoCriar());

    expect(await screen.findByText("Recorrência criada.")).toBeTruthy();
    await waitFor(() => expect(grupoDoTotal().textContent).toContain(`+R$${NBSP}5.000,00`));
    const item = within(agenda() as HTMLElement).getByText("Salário").closest("li") as HTMLElement;
    expect(item.textContent).toContain("daqui a 4 dias");
    expect(item.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-20");
  });

  it("encerrar tira a recorrência do total e da agenda, e ela segue na lista como Encerrada", async () => {
    fingirHoje();
    const c = await conta();
    await chamar("/recorrencias", {
      metodo: "POST",
      corpo: { tipo: "ganho", conta_id: c.id, valor: "10.00", descricao: "Bolsa", dia_do_mes: 20, inicio: "2026-10-01" },
    });
    await abrir();
    await waitFor(() => expect(agenda()).not.toBeNull());
    expect(grupoDoTotal().textContent).toContain(`+R$${NBSP}10,00`);

    const item = await screen.findByRole("listitem", { name: "Bolsa" });
    pedirEncerramento("Bolsa");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar encerramento" }));

    expect(await screen.findByText("Recorrência encerrada.")).toBeTruthy();
    await waitFor(() => expect(agenda()).toBeNull());
    expect(screen.getByText("Nada agendado para os próximos 30 dias")).toBeTruthy();
    // O número visível conta até o novo valor; o nome do grupo já traz o final.
    expect(grupoDoTotal().getAttribute("aria-label")).not.toContain("10,00");
    expect(within(item).getByText("Encerrada")).toBeTruthy();
  });
});
