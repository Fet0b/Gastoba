import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../api/cliente";
import type { Investimento, Sincronizacao, TransacaoImportada } from "../api/tipos";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { HEX_DA_COR } from "../investimentos/cores";
import { entrarNaSimulacao } from "../simulacao/fetchSimulado";
import { adicionarInvestimentoSimulado, definirAlocacoesSimuladas } from "../simulacao/manipuladores";
import { Investimentos } from "./Investimentos";
import { Transacoes } from "./Transacoes";

beforeEach(() => {
  entrarNaSimulacao();
});

function navegacao(): Navegacao {
  return { nomeDaPessoa: "Você", tela: "investimentos", aoIrPara: vi.fn(), aoSair: vi.fn() };
}

/** Um investimento com um aporte de R$ 87,35 dividido entre duas destinações. */
async function prepararAporte(): Promise<string> {
  const id = adicionarInvestimentoSimulado(
    { nome: "LCI teste", tipo: "FIXED_INCOME", subtipo: "LCI", saldo: "1000.00" },
    3,
  );
  await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
  const caixa = await chamar<TransacaoImportada[]>("/transacoes-importadas");
  const mercado = caixa.find((t) => t.descricao === "Mercado Extra") as TransacaoImportada;
  await chamar(`/transacoes-importadas/${mercado.id}/aceitar`, {
    metodo: "POST",
    corpo: {
      como_investimento: true,
      investimento_id: id,
      destinacoes: [
        { tag: "casa", percentual: 60 },
        { tag: "viagem", percentual: 40 },
      ],
    },
  });
  return id;
}

/** Abre o menu "Mais ações" do item e escolhe "Desfazer"; o diálogo de confirmação abre. */
function abrirDesfazer(escopo: ReturnType<typeof within>, gatilho: RegExp, item: RegExp): void {
  fireEvent.click(escopo.getByRole("button", { name: gatilho }));
  fireEvent.click(screen.getByRole("menuitem", { name: item }));
}

function abrirAcaoDaPosicao(posicao:HTMLElement, acao:string) {
  const concluir=within(posicao).queryByRole("button",{name:"Concluir"});
  if(concluir)fireEvent.click(concluir);
  fireEvent.click(within(posicao).getByRole("button",{name:/^Mais ações de /}));
  fireEvent.click(screen.getByRole("menuitem",{name:acao}));
}

describe("Investimentos", () => {
  it("sempre oferece o link Ver caixinhas, mesmo sem gestão ou posições, e não gerencia mais aqui", async () => {
    const nav = navegacao();
    render(<Investimentos navegacao={nav} />);

    fireEvent.click(await screen.findByRole("button", { name: "Ver caixinhas" }));
    expect(nav.aoIrPara).toHaveBeenCalledWith("caixinhas");
    expect(screen.queryByRole("button", { name: "Gerenciar caixinhas" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Gerenciar caixinhas" })).toBeNull();
  });

  it("tem cabeçalho com subtítulo, um só h1 e um só h2 'Investimentos'", async () => {
    render(<Investimentos navegacao={navegacao()} />);

    await screen.findByText("Nenhum investimento ainda");
    const titulo = screen.getByRole("heading", { level: 2, name: "Investimentos" });
    expect(titulo.closest("header")?.querySelector("p")?.textContent).toBe("Para onde vai o que você guarda.");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 2, name: "Investimentos" })).toHaveLength(1);
  });

  it("cada grupo de posições tem cabeçalho visual aria-hidden logo antes da lista", async () => {
    adicionarInvestimentoSimulado({ nome: "CDB A", tipo: "FIXED_INCOME", saldo: "1000.01" }, 1);
    await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
    render(<Investimentos navegacao={navegacao()} />);

    const lista = await screen.findByRole("list", { name: "Seus investimentos" });
    const cabecalho = lista.previousElementSibling;
    expect(cabecalho?.hasAttribute("data-cabecalho-da-lista")).toBe(true);
    expect(cabecalho?.getAttribute("aria-hidden")).toBe("true");
  });

  it("organiza as posições por categoria com quantidade, total e grupos que podem ser recolhidos", async () => {
    for (const item of [
      { nome: "CDB A", tipo: "FIXED_INCOME", saldo: "1000.01" },
      { nome: "LCI B", tipo: "FIXED_INCOME", saldo: "2000.02" },
      { nome: "Fundo C", tipo: "MUTUAL_FUND", saldo: "400.00" },
      { nome: "Ação D", tipo: "EQUITY", saldo: "50.00" },
      { nome: "Produto novo", tipo: "NOVO", saldo: "0.00" },
    ]) adicionarInvestimentoSimulado(item, 1);
    await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
    render(<Investimentos navegacao={navegacao()} />);

    const posicoes = await screen.findByRole("region", { name: "Posições" });
    await within(posicoes).findByRole("listitem", { name: "CDB A" });
    const grupos = Array.from(posicoes.querySelectorAll("details[data-categoria]"));
    expect(grupos.map((g) => g.getAttribute("data-categoria"))).toEqual([
      "FIXED_INCOME", "EQUITY", "MUTUAL_FUND", "OTHER",
    ]);
    const resumo = grupos[0].querySelector("summary") as HTMLElement;
    expect(resumo.textContent).toContain("Renda fixa");
    expect(resumo.textContent).toContain("2 investimentos");
    expect(resumo.textContent).toContain("3.000,03");
    expect(grupos[0].hasAttribute("open")).toBe(true);
    expect(within(grupos[0] as HTMLElement).getAllByRole("listitem").map((i) => i.getAttribute("aria-label"))).toEqual(["LCI B", "CDB A"]);
    expect(grupos[1].querySelector("summary")?.textContent).toContain("1 investimento");
    expect(grupos[3].hasAttribute("open")).toBe(false);
    fireEvent.click(grupos[3].querySelector("summary")!);
    expect(within(grupos[3] as HTMLElement).getByRole("listitem", { name: "Produto novo" })).toBeTruthy();
    fireEvent.click(resumo);
    expect(grupos[0].hasAttribute("open")).toBe(false);
    fireEvent.click(resumo);
    expect(grupos[0].hasAttribute("open")).toBe(true);
  });

  it("na renda fixa, agrupa por tipo de título com quantidade e total, e cada subgrupo recolhe", async () => {
    for (const item of [
      { nome: "CDB do banco", tipo: "FIXED_INCOME", subtipo: "CDB", saldo: "1000.01" },
      { nome: "LCI do banco", tipo: "FIXED_INCOME", subtipo: "LCI", saldo: "2000.02" },
      { nome: "LCA do banco", tipo: "FIXED_INCOME", subtipo: "LCA", saldo: "500.00" },
      { nome: "Selic 2029", tipo: "FIXED_INCOME", subtipo: "TREASURY", saldo: "300.00" },
      { nome: "Letra financeira", tipo: "FIXED_INCOME", subtipo: "LF", saldo: "10.00" },
      { nome: "Fundo C", tipo: "MUTUAL_FUND", saldo: "400.00" },
    ]) adicionarInvestimentoSimulado(item, 1);
    await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
    render(<Investimentos navegacao={navegacao()} />);

    const posicoes = await screen.findByRole("region", { name: "Posições" });
    await within(posicoes).findByRole("listitem", { name: "CDB do banco" });
    const renda = posicoes.querySelector('details[data-categoria="FIXED_INCOME"]') as HTMLElement;
    const subgrupos = Array.from(renda.querySelectorAll("details[data-subgrupo]")) as HTMLElement[];

    expect(subgrupos.map((g) => g.getAttribute("data-subgrupo"))).toEqual([
      "CDB", "LCI_LCA", "TREASURY", "OUTRAS",
    ]);
    const lciLca = subgrupos[1].querySelector("summary") as HTMLElement;
    expect(lciLca.textContent).toContain("LCIs e LCAs");
    expect(lciLca.textContent).toContain("2 investimentos");
    expect(lciLca.textContent).toContain("2.500,02");
    expect(
      within(subgrupos[1]).getAllByRole("listitem").map((i) => i.getAttribute("aria-label")),
    ).toEqual(["LCI do banco", "LCA do banco"]);
    expect(subgrupos[3].querySelector("summary")?.textContent).toContain("Outras de renda fixa");
    expect(posicoes.querySelector('details[data-categoria="MUTUAL_FUND"] details[data-subgrupo]')).toBeNull();

    expect(subgrupos[1].hasAttribute("open")).toBe(true);
    fireEvent.click(lciLca);
    expect(subgrupos[1].hasAttribute("open")).toBe(false);
    expect(renda.hasAttribute("open")).toBe(true);
  });

  it("sem investimentos, explica de onde eles vêm e leva às Transações", async () => {
    const nav = navegacao();
    render(<Investimentos navegacao={nav} />);

    const titulo = await screen.findByText("Nenhum investimento ainda");
    // O tracejado do estado vazio é o próprio contêiner: não há painel sólido em volta.
    expect(titulo.closest("section")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ir para Transações" }));
    expect(nav.aoIrPara).toHaveBeenCalledWith("transacoes");
  });

  it("mostra o total, a pizza por destinação e a posição com as destinações", async () => {
    await prepararAporte();
    render(<Investimentos navegacao={navegacao()} />);

    const posicao = await screen.findByRole("listitem", { name: "LCI teste" });
    expect(posicao.textContent).toContain("R$");
    if(!within(posicao).queryByRole("dialog"))abrirAcaoDaPosicao(posicao,"Ver destinações e cores");
    expect(within(posicao).getByRole("row", { name: /casa/ })).toBeTruthy();
    expect(within(posicao).getByRole("row", { name: /viagem/ })).toBeTruthy();
    const legenda = await screen.findByRole("list", { name: "Distribuição por destinação" });
    expect(within(legenda).getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Total investido" }).textContent).toContain("1.000,00");
  });

  it("mostra o aplicado, o rendimento e a rentabilidade que a instituição informa, e o rendimento de cada destinação", async () => {
    const id = adicionarInvestimentoSimulado(
      {
        nome: "LCI rende",
        tipo: "FIXED_INCOME",
        saldo: "1043.21",
        valor_aplicado: "1000.00",
        rendimento: "43.21",
      },
      1,
    );
    await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
    const caixa = await chamar<TransacaoImportada[]>("/transacoes-importadas");
    const farmacia = caixa.find((t) => t.descricao === "Farmácia") as TransacaoImportada;
    await chamar(`/transacoes-importadas/${farmacia.id}/aceitar`, {
      metodo: "POST",
      corpo: {
        como_investimento: true,
        investimento_id: id,
        destinacoes: [{ tag: "casa", percentual: 100 }],
      },
    });
    render(<Investimentos navegacao={navegacao()} />);

    const posicao = await screen.findByRole("listitem", { name: "LCI rende" });
    const resumo = within(posicao).getByLabelText("Rentabilidade de LCI rende");
    expect(posicao.textContent).toContain("1.000,00");
    expect(resumo.textContent).toContain("43,21");
    expect(resumo.textContent).toContain("+4,32%");
    if(!within(posicao).queryByRole("dialog"))abrirAcaoDaPosicao(posicao,"Ver destinações e cores");
    expect(within(posicao).getByRole("row", { name: /casa/ }).textContent).toContain("%)");
  });

  it("sem o dado da instituição não estima o aplicado nem a rentabilidade pelos aportes", async () => {
    await prepararAporte();
    render(<Investimentos navegacao={navegacao()} />);

    const posicao = await screen.findByRole("listitem", { name: "LCI teste" });
    const resumo = within(posicao).getByLabelText("Rentabilidade de LCI teste");
    expect(resumo.textContent).toContain("Sem rentabilidade");
    expect(within(posicao).queryByText("Estimado pelos seus aportes")).toBeNull();
  });

  it("a conta investimentos mostra só o saldo do banco, sem conferência, aplicado nem rendimento", async () => {
    await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
    const [conta] = await chamar<{ id: string }[]>("/contas");
    await chamar("/caixinhas", {
      metodo: "POST",
      corpo: { conta_id: conta.id, saldo_remunerado: "823.88", data_do_saldo: "2026-11-08" },
    });
    render(<Investimentos navegacao={{ ...navegacao(), importacaoBancaria: true }} />);

    const posicao = await screen.findByRole("listitem", { name: /Conta investimentos/ });
    expect(posicao.textContent).toContain("823,88");
    expect(within(posicao).queryByText("Aplicado")).toBeNull();
    expect(within(posicao).queryByText("Rendimento")).toBeNull();
    expect(within(posicao).queryByText("Sem rentabilidade")).toBeNull();
    expect(within(posicao).queryByText("Estimado pelos seus aportes")).toBeNull();
    expect(screen.queryByText("Conferência com extrato")).toBeNull();
    expect(screen.queryByRole("button", { name: "Conferir com extrato" })).toBeNull();
    expect(screen.queryByText(/divergente|Divergente/)).toBeNull();
  });

  it("com o dado da instituição não mostra o aviso de estimativa", async () => {
    adicionarInvestimentoSimulado(
      { nome: "LCI rende", tipo: "FIXED_INCOME", saldo: "1043.21", valor_aplicado: "1000.00", rendimento: "43.21" },
      1,
    );
    await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
    render(<Investimentos navegacao={navegacao()} />);

    const posicao = await screen.findByRole("listitem", { name: "LCI rende" });
    expect(within(posicao).getByLabelText("Rentabilidade de LCI rende")).toBeTruthy();
    expect(within(posicao).queryByText("Estimado pelos seus aportes")).toBeNull();
  });

  it("mostra a taxa contratada sem o adicional zerado", async () => {
    adicionarInvestimentoSimulado(
      {
        nome: "CDB com taxa",
        tipo: "FIXED_INCOME",
        saldo: "500.00",
        taxa: { percentual: "101.2", indexador: "CDI", adicional_anual: null },
      },
      1,
    );
    await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
    render(<Investimentos navegacao={navegacao()} />);

    const posicao = await screen.findByRole("listitem", { name: "CDB com taxa" });
    const taxa = within(posicao).getByLabelText("Taxa de CDB com taxa");
    expect(taxa.textContent).toContain("101,2% CDI");
    expect(taxa.textContent).not.toContain("a.a.");
  });

  it("sem taxa informada, não mostra a linha da taxa", async () => {
    await prepararAporte();
    render(<Investimentos navegacao={navegacao()} />);

    const posicao = await screen.findByRole("listitem", { name: "LCI teste" });
    expect(within(posicao).queryByLabelText("Taxa de LCI teste")).toBeNull();
  });

  it("o alternador mostra a pizza por tipo", async () => {
    await prepararAporte();
    render(<Investimentos navegacao={navegacao()} />);
    await screen.findByRole("list", { name: "Distribuição por destinação" });

    fireEvent.click(screen.getByRole("button", { name: "Por tipo" }));

    const legenda = await screen.findByRole("list", { name: "Distribuição por tipo" });
    expect(within(legenda).getByRole("button", { name: /Renda fixa/ })).toBeTruthy();
  });

  it("tirar uma parte da pizza vale só para a visão atual", async () => {
    await prepararAporte();
    render(<Investimentos navegacao={navegacao()} />);
    const legenda = await screen.findByRole("list", { name: "Distribuição por destinação" });

    fireEvent.click(within(legenda).getAllByRole("button", { name: /^Mostrar no gráfico:/ })[0]);
    expect(screen.getByRole("button", { name: "Mostrar todas" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Por tipo" }));

    const porTipo = await screen.findByRole("list", { name: "Distribuição por tipo" });
    for (const botao of within(porTipo).getAllByRole("button", { name: /^Mostrar no gráfico:/ })) {
      expect(botao.getAttribute("aria-pressed")).toBe("true");
    }
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Mostrar todas" })).toBeNull();
  });

  it("a evolução mostra os saldos guardados e a variação, e a janela é trocada por botões", async () => {
    await prepararAporte();
    render(<Investimentos navegacao={navegacao()} />);

    expect(await screen.findByText("Variação",{exact:true})).toBeTruthy();
    expect(screen.getByRole("button", { name: "30 dias" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "90 dias" }));
    expect(screen.getByRole("button", { name: "90 dias" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("realocar move o principal e o histórico de realocações mostra a mudança", async () => {
    const id = await prepararAporte();
    render(<Investimentos navegacao={navegacao()} />);
    const posicao = await screen.findByRole("listitem", { name: "LCI teste" });

    abrirAcaoDaPosicao(posicao,"Realocar");
    fireEvent.change(within(posicao).getByLabelText("Levar para (tag)"), {
      target: { value: "reserva" },
    });
    fireEvent.change(within(posicao).getByLabelText("Percentual (1 a 100)"), {
      target: { value: "50" },
    });
    fireEvent.click(within(posicao).getByRole("button", { name: "Realocar" }));

    expect(await screen.findByText("Realocação feita.")).toBeTruthy();
    abrirAcaoDaPosicao(posicao,"Ver destinações e cores");
    await waitFor(() => expect(within(posicao).getByRole("row", { name: /reserva/ })).toBeTruthy());
    const [depois] = (await chamar<Investimento[]>("/investimentos")).filter((i) => i.id === id);
    expect(depois.destinacoes.map((d) => d.tag).sort()).toEqual(["casa", "reserva", "viagem"]);
  });

  it("na posição por fração, realocar escolhe a caixinha de destino e muda a divisão", async () => {
    const id = adicionarInvestimentoSimulado({ nome: "CDB fração", tipo: "FIXED_INCOME", saldo: "1000.00" }, 1);
    const outra = adicionarInvestimentoSimulado({ nome: "CDB outro", tipo: "FIXED_INCOME", saldo: "50.00" }, 1);
    await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
    definirAlocacoesSimuladas(id, { reserva: "600.00", viagem: "400.00" });
    definirAlocacoesSimuladas(outra, { celular: "50.00" });
    render(<Investimentos navegacao={navegacao()} />);
    const posicao = await screen.findByRole("listitem", { name: "CDB fração" });

    abrirAcaoDaPosicao(posicao, "Realocar");
    expect(within(posicao).queryByLabelText("Levar para (tag)")).toBeNull();
    const destino = within(posicao).getByLabelText("Levar para a caixinha") as HTMLSelectElement;
    expect(destino.value).toBe("");
    // O catálogo chega por conta própria (antes o diálogo de caixinhas da página já o buscava).
    await waitFor(() => expect([...destino.options].map((o) => o.textContent)).toEqual(["Escolha a caixinha", "Celular", "Viagem"]));
    const botao = within(posicao).getByRole("button", { name: "Realocar" }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(within(posicao).getByText("Escolha a caixinha de destino.")).toBeTruthy();

    fireEvent.change(destino, { target: { value: "celular" } });
    fireEvent.change(within(posicao).getByLabelText("Percentual (1 a 100)"), { target: { value: "25" } });
    fireEvent.click(botao);

    expect(await screen.findByText("Realocação feita.")).toBeTruthy();
    const [depois] = (await chamar<Investimento[]>("/investimentos")).filter((i) => i.id === id);
    expect(Object.fromEntries(depois.destinacoes.map((d) => [d.tag, d.principal]))).toEqual({
      reserva: "450.00",
      viagem: "400.00",
      celular: "150.00",
    });
    expect(depois.saldo).toBe("1000.00");
  });

  it("na posição por fração, desfazer a realocação devolve a fração", async () => {
    const id = adicionarInvestimentoSimulado({ nome: "CDB fração", tipo: "FIXED_INCOME", saldo: "1000.00" }, 1);
    await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
    definirAlocacoesSimuladas(id, { reserva: "600.00", viagem: "400.00" });
    await chamar(`/investimentos/${id}/realocacoes`, {
      metodo: "POST",
      corpo: { origem: "reserva", destino: "viagem", valor: "100.00", data: "2026-10-22" },
    });
    render(<Investimentos navegacao={navegacao()} />);
    const posicao = await screen.findByRole("listitem", { name: "CDB fração" });
    abrirAcaoDaPosicao(posicao, "Ver realocações");

    fireEvent.click(await within(posicao).findByRole("button", { name: /^Mais ações de realocação/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Desfazer realocação/ }));
    fireEvent.click(within(posicao).getByRole("button", { name: "Sim, desfazer" }));

    expect(await screen.findByText("Realocação desfeita.")).toBeTruthy();
    const [depois] = (await chamar<Investimento[]>("/investimentos")).filter((i) => i.id === id);
    expect(Object.fromEntries(depois.destinacoes.map((d) => [d.tag, d.principal]))).toEqual({
      reserva: "600.00",
      viagem: "400.00",
    });
  });

  it("realocar acima do principal mostra a mensagem da API junto ao formulário", async () => {
    await prepararAporte();
    render(<Investimentos navegacao={navegacao()} />);
    const posicao = await screen.findByRole("listitem", { name: "LCI teste" });

    abrirAcaoDaPosicao(posicao,"Realocar");
    fireEvent.change(within(posicao).getByLabelText("Levar para (tag)"), { target: { value: "x" } });
    fireEvent.click(within(posicao).getByLabelText("Valor em reais"));
    fireEvent.change(within(posicao).getByLabelText("Valor (R$)"), { target: { value: "99999" } });
    fireEvent.click(within(posicao).getByRole("button", { name: "Realocar" }));

    expect((await within(posicao).findByRole("alert")).textContent).toContain("passa do principal");
  });

  it("a linha de destinação é compacta: a cor tem texto oculto e as ações ficam juntas", async () => {
    await prepararAporte();
    render(<Investimentos navegacao={navegacao()} />);
    const posicao = await screen.findByRole("listitem", { name: "LCI teste" });

    abrirAcaoDaPosicao(posicao,"Ver destinações e cores");
    const nomes = posicao.querySelectorAll("th[data-nome-da-destinacao]");
    expect(nomes.length).toBeGreaterThan(0);
    const botaoDeCor = within(nomes[0] as HTMLElement).getAllByRole("button", { name: /^Cor de «/ })[0];
    expect(botaoDeCor.querySelector(".visualmente-oculto")?.textContent).toMatch(/^Cor de «/);
    expect(botaoDeCor.querySelector("[aria-hidden='true']")).not.toBeNull();

    fireEvent.click(screen.getByRole("button",{name:"Concluir"}));
    const acoes = posicao;
    fireEvent.click(within(acoes).getByRole("button",{name:/Mais ações/}));
    expect(screen.getByRole("menuitem",{name:"Realocar"})).toBeTruthy();
    expect(screen.getByRole("menuitem",{name:"Ver realocações"})).toBeTruthy();
  });

  it("a tag de destino da realocação aparece em minúsculas desde a digitação", async () => {
    await prepararAporte();
    render(<Investimentos navegacao={navegacao()} />);
    const posicao = await screen.findByRole("listitem", { name: "LCI teste" });

    abrirAcaoDaPosicao(posicao,"Realocar");
    const campo = within(posicao).getByLabelText("Levar para (tag)") as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "Casa Nova" } });

    expect(campo.value).toBe("casa nova");
    expect(campo.getAttribute("autocapitalize")).toBe("none");
  });

  it("a tag da destinação aparece em minúsculas desde a digitação", async () => {
    adicionarInvestimentoSimulado(
      { nome: "CDB antigo", tipo: "FIXED_INCOME", saldo: "1043.21", valor_aplicado: "1000.00" },
      1,
    );
    render(<Investimentos navegacao={navegacao()} />);
    const posicao = await screen.findByRole("listitem", { name: "CDB antigo" });

    abrirAcaoDaPosicao(posicao,"Definir destinações");
    const campo = within(posicao).getByLabelText("Tag da destinação 1") as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "Reserva" } });

    expect(campo.value).toBe("reserva");
    expect(campo.getAttribute("autocapitalize")).toBe("none");
  });

  it("posição sem destinação oferece definir as destinações do saldo inicial", async () => {
    const id = adicionarInvestimentoSimulado(
      { nome: "CDB antigo", tipo: "FIXED_INCOME", saldo: "1043.21", valor_aplicado: "1000.00" },
      1,
    );
    render(<Investimentos navegacao={navegacao()} />);
    const posicao = await screen.findByRole("listitem", { name: "CDB antigo" });

    expect(within(posicao).queryByRole("table")).toBeNull();
    expect(within(posicao).queryByText(/Sem destinação ainda/)).toBeNull();
    abrirAcaoDaPosicao(posicao,"Definir destinações");
    // Sem escolher investimento: é o desta posição. Mostra quanto cabe a cada destinação.
    expect(within(posicao).queryByLabelText("Investimento")).toBeNull();
    fireEvent.change(within(posicao).getByLabelText("Tag da destinação 1"), { target: { value: "casa" } });
    fireEvent.change(within(posicao).getByLabelText("Percentual da destinação 1"), {
      target: { value: "70" },
    });
    fireEvent.click(within(posicao).getByRole("button", { name: "Adicionar destinação" }));
    fireEvent.change(within(posicao).getByLabelText("Tag da destinação 2"), { target: { value: "viagem" } });
    fireEvent.change(within(posicao).getByLabelText("Percentual da destinação 2"), {
      target: { value: "30" },
    });
    expect(posicao.textContent).toContain("700,00");
    fireEvent.click(within(posicao).getByRole("button", { name: "Salvar destinações" }));

    expect(await screen.findByText("Destinações definidas.")).toBeTruthy();
    abrirAcaoDaPosicao(posicao,"Ver destinações e cores");
    await waitFor(() => expect(within(posicao).getByRole("row", { name: /casa/ })).toBeTruthy());
    expect(within(posicao).queryByRole("button", { name: "Definir destinações" })).toBeNull();
    const [depois] = (await chamar<Investimento[]>("/investimentos")).filter((i) => i.id === id);
    expect(depois.destinacoes.map((d) => [d.tag, d.principal])).toEqual([
      ["casa", "700.00"],
      ["viagem", "300.00"],
    ]);
    expect(screen.queryByRole("list", { name: "Aportes e resgates" })).toBeNull();
  });

  it("desfazer o saldo inicial pede confirmação e devolve o valor a destinar", async () => {
    const id = adicionarInvestimentoSimulado(
      { nome: "CDB errado", tipo: "FIXED_INCOME", saldo: "500.00", valor_aplicado: "500.00" },
      1,
    );
    await chamar(`/investimentos/${id}/destinacoes`, {
      metodo: "POST",
      corpo: { destinacoes: [{ tag: "computador", percentual: 100 }] },
    });
    const vista = render(<Transacoes navegacao={{ ...navegacao(), gestaoDeInvestimentos: true }} vistaInicial="aportes" />);
    const movimento = await screen.findByRole("listitem", { name: "Saldo inicial" });

    abrirDesfazer(within(movimento), /^Mais ações de saldo inicial/, /Desfazer saldo inicial/);
    // O primeiro clique só pergunta; nada foi apagado.
    expect(await chamar<Investimento[]>("/investimentos")).toHaveLength(1);
    expect((await chamar<Investimento[]>("/investimentos"))[0].destinacoes[0].tag).toBe("computador");
    expect(document.activeElement?.textContent).toBe("Cancelar");
    fireEvent.click(within(movimento).getByRole("button", { name: "Sim, desfazer" }));

    expect(await screen.findByText("Saldo inicial desfeito.")).toBeTruthy();
    vista.rerender(<Investimentos navegacao={navegacao()} />);
    const posicao = await screen.findByRole("listitem", { name: "CDB errado" });
    fireEvent.click(within(posicao).getByRole("button",{name:/Mais ações/}));
    expect(screen.getByRole("menuitem",{name:"Definir destinações"})).toBeTruthy();
    expect(screen.queryByRole("listitem", { name: "Saldo inicial" })).toBeNull();
  });

  it("cancelar o desfazer não apaga nada e devolve o foco", async () => {
    const id = adicionarInvestimentoSimulado(
      { nome: "CDB certo", tipo: "FIXED_INCOME", saldo: "500.00", valor_aplicado: "500.00" },
      1,
    );
    await chamar(`/investimentos/${id}/destinacoes`, {
      metodo: "POST",
      corpo: { destinacoes: [{ tag: "casa", percentual: 100 }] },
    });
    render(<Transacoes navegacao={{ ...navegacao(), gestaoDeInvestimentos: true }} vistaInicial="aportes" />);
    const movimento = await screen.findByRole("listitem", { name: "Saldo inicial" });

    abrirDesfazer(within(movimento), /^Mais ações de saldo inicial/, /Desfazer saldo inicial/);
    fireEvent.click(within(movimento).getByRole("button", { name: "Cancelar" }));

    const botao = within(movimento).getByRole("button", { name: /^Mais ações de saldo inicial/ });
    expect(document.activeElement).toBe(botao);
    expect((await chamar<Investimento[]>("/investimentos"))[0].destinacoes[0].tag).toBe("casa");
  });

  it("aporte da caixa de entrada não oferece desfazer", async () => {
    await prepararAporte();
    render(<Transacoes navegacao={{ ...navegacao(), gestaoDeInvestimentos: true }} vistaInicial="aportes" />);
    const movimento = await screen.findByRole("listitem", { name: "Mercado Extra" });

    expect(within(movimento).queryByRole("button", { name: /Desfazer/ })).toBeNull();
  });

  it("desfazer uma realocação devolve o principal à origem", async () => {
    const id = await prepararAporte();
    await chamar(`/investimentos/${id}/realocacoes`, {
      metodo: "POST",
      corpo: { origem: "casa", destino: "reserva", percentual: 100, data: "2026-10-22" },
    });
    render(<Investimentos navegacao={navegacao()} />);
    const posicao = await screen.findByRole("listitem", { name: "LCI teste" });
    abrirAcaoDaPosicao(posicao,"Ver realocações");

    fireEvent.click(await within(posicao).findByRole("button", { name: /^Mais ações de realocação/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Desfazer realocação/ }));
    fireEvent.click(within(posicao).getByRole("button", { name: "Sim, desfazer" }));

    expect(await screen.findByText("Realocação desfeita.")).toBeTruthy();
    await waitFor(async () => {
      const [depois] = (await chamar<Investimento[]>("/investimentos")).filter((i) => i.id === id);
      expect(depois.destinacoes.map((d) => d.tag).sort()).toEqual(["casa", "viagem"]);
    });
    expect(await within(posicao).findByText("Nenhuma realocação ainda")).toBeTruthy();
  });

  it("desfazer realocação que o destino já usou mostra a mensagem da API", async () => {
    const id = await prepararAporte();
    for (const [origem, destino] of [
      ["casa", "reserva"],
      ["reserva", "celular"],
    ]) {
      await chamar(`/investimentos/${id}/realocacoes`, {
        metodo: "POST",
        corpo: { origem, destino, percentual: 100, data: "2026-10-22" },
      });
    }
    render(<Investimentos navegacao={navegacao()} />);
    const posicao = await screen.findByRole("listitem", { name: "LCI teste" });
    abrirAcaoDaPosicao(posicao,"Ver realocações");

    const botoes = await within(posicao).findAllByRole("button", { name: /^Mais ações de realocação/ });
    const daCasa = botoes.find((b) => b.getAttribute("aria-label")?.includes("de casa para reserva"));
    fireEvent.click(daCasa as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: /Desfazer realocação/ }));
    fireEvent.click(within(posicao).getByRole("button", { name: "Sim, desfazer" }));

    expect(await screen.findByText(/já não tem esse valor/)).toBeTruthy();
  });

  it("sem valor a destinar, mostra a mensagem da API junto ao editor", async () => {
    const id = adicionarInvestimentoSimulado(
      { nome: "CDB disputado", tipo: "FIXED_INCOME", saldo: "50.00", valor_aplicado: "50.00" },
      1,
    );
    render(<Investimentos navegacao={navegacao()} />);
    const posicao = await screen.findByRole("listitem", { name: "CDB disputado" });

    abrirAcaoDaPosicao(posicao,"Definir destinações");
    // Outra aba destinou tudo enquanto o editor estava aberto: a API responde 409.
    await chamar(`/investimentos/${id}/destinacoes`, {
      metodo: "POST",
      corpo: { destinacoes: [{ tag: "reserva", percentual: 100 }] },
    });
    fireEvent.change(within(posicao).getByLabelText("Tag da destinação 1"), { target: { value: "casa" } });
    fireEvent.click(within(posicao).getByRole("button", { name: "Salvar destinações" }));

    expect((await within(posicao).findByRole("alert")).textContent).toContain("já tem destinação");
  });

  it("sem valor aplicado a destinar, a posição não oferece definir", async () => {
    adicionarInvestimentoSimulado(
      { nome: "CDB zerado", tipo: "FIXED_INCOME", saldo: "50.00", valor_aplicado: "0.00" },
      1,
    );
    render(<Investimentos navegacao={navegacao()} />);
    const posicao = await screen.findByRole("listitem", { name: "CDB zerado" });

    expect(within(posicao).queryByRole("button", { name: "Definir destinações" })).toBeNull();
  });

  it("posição com aporte que não cobre o valor aplicado oferece definir o resto", async () => {
    const id = adicionarInvestimentoSimulado(
      { nome: "CDB em parte", tipo: "FIXED_INCOME", saldo: "2050.00", valor_aplicado: "2000.00" },
      1,
    );
    await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
    const caixa = await chamar<TransacaoImportada[]>("/transacoes-importadas");
    const mercado = caixa.find((t) => t.descricao === "Mercado Extra") as TransacaoImportada;
    await chamar(`/transacoes-importadas/${mercado.id}/aceitar`, {
      metodo: "POST",
      corpo: {
        como_investimento: true,
        investimento_id: id,
        destinacoes: [{ tag: "casa", percentual: 100 }],
      },
    });
    render(<Investimentos navegacao={navegacao()} />);
    const posicao = await screen.findByRole("listitem", { name: "CDB em parte" });

    if(!within(posicao).queryByRole("dialog"))abrirAcaoDaPosicao(posicao,"Ver destinações e cores");
    expect(within(posicao).getByRole("row", { name: /casa/ })).toBeTruthy();
    abrirAcaoDaPosicao(posicao,"Definir destinações");
    expect(within(posicao).getByText(/A dividir:/)).toBeTruthy();
  });

  it("posição já com destinações não oferece definir de novo", async () => {
    await prepararAporte();
    render(<Investimentos navegacao={navegacao()} />);
    const posicao = await screen.findByRole("listitem", { name: "LCI teste" });

    expect(within(posicao).queryByRole("button", { name: "Definir destinações" })).toBeNull();
  });

  it("lista os aportes e associa um sem investimento", async () => {
    const id = adicionarInvestimentoSimulado({ nome: "LCI teste", tipo: "FIXED_INCOME", saldo: "500.00" }, 1);
    await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
    const caixa = await chamar<TransacaoImportada[]>("/transacoes-importadas");
    const farmacia = caixa.find((t) => t.descricao === "Farmácia") as TransacaoImportada;
    await chamar(`/transacoes-importadas/${farmacia.id}/aceitar`, {
      metodo: "POST",
      corpo: { como_investimento: true },
    });
    render(<Transacoes navegacao={{ ...navegacao(), gestaoDeInvestimentos: true }} vistaInicial="aportes" />);
    const movimento = await screen.findByRole("listitem", { name: "Farmácia" });

    fireEvent.click(within(movimento).getByRole("button", { name: "Associar a um investimento" }));
    fireEvent.change(within(movimento).getByLabelText("Investimento"), { target: { value: id } });
    fireEvent.change(within(movimento).getByLabelText("Tag da destinação 1"), {
      target: { value: "reserva" },
    });
    fireEvent.click(within(movimento).getByRole("button", { name: /Associar: Farmácia/ }));

    expect(await screen.findByText("Movimento associado ao investimento.")).toBeTruthy();
    await waitFor(async () => {
      const [lista] = (await chamar<Investimento[]>("/investimentos")).filter((i) => i.id === id);
      expect(lista.destinacoes.map((d) => d.tag)).toEqual(["reserva"]);
    });
  });
});

describe("Investimentos: atalho para a gestão centralizada", () => {
  it.each(["importacaoBancaria", "gestaoDeInvestimentos"] as const)("com %s oferece o atalho até sem posições, sem consultar movimentos", async (campo) => {
    const nav = { ...navegacao(), [campo]: true };
    const pedidos: string[] = [];
    const anterior = globalThis.fetch;
    vi.stubGlobal("fetch", (url: RequestInfo | URL, opcoes?: RequestInit) => { pedidos.push(String(url)); return anterior(url, opcoes); });
    render(<Investimentos navegacao={nav} />);
    fireEvent.click(await screen.findByRole("button", { name: "Ver aportes e resgates em Transações" }));
    expect(nav.aoIrPara).toHaveBeenCalledWith("transacoes", { vistaDeTransacoes: "aportes" });
    expect(pedidos.some((url) => url.includes("movimentos-de-investimento"))).toBe(false);
    expect(screen.queryByRole("list", { name: "Aportes e resgates" })).toBeNull();
  });
  it("sem permissões não oferece o botão", async () => {
    render(<Investimentos navegacao={navegacao()} />); await screen.findByText("Nenhum investimento ainda");
    expect(screen.queryByRole("button", { name: "Ver aportes e resgates em Transações" })).toBeNull();
  });
  it("a explicação do aporte é uma Dica no cabeçalho, sem parágrafo nem cartão próprios", async () => {
    const nav = { ...navegacao(), importacaoBancaria: true };
    render(<Investimentos navegacao={nav} />);
    await screen.findByRole("button", { name: "Ver aportes e resgates em Transações" });

    const dica = screen.getByRole("button", { name: "Sobre os aportes" });
    const texto = document.getElementById(dica.getAttribute("aria-describedby") ?? "");
    expect(texto?.textContent).toContain("Aportes com dinheiro do mês reduzem o disponível.");
    expect(screen.queryByRole("region", { name: "Aportes e resgates" })).toBeNull();
    expect(screen.queryByText("Consulte e gerencie seus movimentos em Transações.")).toBeNull();
    const atalho = screen.getByRole("button", { name: "Ver aportes e resgates em Transações" });
    expect(atalho.getAttribute("data-variante")).toBe("terciario");
  });
});

it('mostra os aportes sem investimento mesmo sem posição cadastrada', async () => {
  await chamar('/sincronizacoes', {metodo:'POST'});
  const caixa = await chamar<TransacaoImportada[]>('/transacoes-importadas');
  const farmacia = caixa.find(t=>t.descricao==='Farmácia')!;
  await chamar(`/transacoes-importadas/${farmacia.id}/aceitar`, {metodo:'POST',corpo:{como_investimento:true}});
  render(<Investimentos navegacao={{ ...navegacao(), importacaoBancaria: true, gestaoDeInvestimentos: true }} />);
  expect(await screen.findByText('1 aporte sem investimento')).toBeTruthy();
  expect(screen.getByText(/ainda não estão ligados/)).toBeTruthy();
  expect(screen.getByText(/ainda não estão ligados/).textContent).toContain('45,90');
  expect(screen.queryByText(/Vincular/)).toBeNull();
});

it("com a importação, o cartão da Revisão da bolsa aparece e o banner não conta o que ele já propõe ligar", async () => {
  render(<Investimentos navegacao={{ ...navegacao(), importacaoBancaria: true, gestaoDeInvestimentos: true }} />);
  expect(await screen.findByRole("button", { name: "Revisar" })).toBeTruthy();
  expect(screen.queryByText(/sem investimento$/)).toBeNull();
});

it("a cor escolhida em Caixinhas aparece igual no gráfico, na legenda e na tabela da distribuição (077)", async () => {
  await prepararAporte(); // aporte dividido entre as caixinhas "casa" (60%) e "viagem" (40%)
  const catalogo = await chamar<{ id: string; nome: string }[]>("/destinacoes-cadastradas");
  expect(catalogo.map((c) => c.nome)).toContain("viagem");
  // A cor é escolhida pela tela Caixinhas (mesma rota da cor por tag) e Investimentos a lê do mesmo dado.
  await chamar("/cores-das-destinacoes", { metodo: "PUT", corpo: { tag: "viagem", cor: "coral" } });
  const auxiliar = document.createElement("span");
  auxiliar.style.backgroundColor = HEX_DA_COR.coral;

  render(<Investimentos navegacao={navegacao()} />);
  const distribuicao = await screen.findByLabelText("Distribuição dos investimentos");
  await waitFor(() => expect(distribuicao.textContent).toContain("Viagem"));

  const pontos = [...distribuicao.querySelectorAll<HTMLElement>("[aria-hidden='true']")].filter((e) => e.style.backgroundColor === auxiliar.style.backgroundColor);
  expect(pontos.length).toBeGreaterThanOrEqual(2); // legenda e tabela equivalente
  const fatias = [...distribuicao.querySelectorAll("path")].filter((p) => p.getAttribute("fill")?.toLowerCase() === HEX_DA_COR.coral.toLowerCase());
  expect(fatias.length).toBeGreaterThanOrEqual(1);
});
