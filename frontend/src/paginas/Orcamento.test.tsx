import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../api/cliente";
import type { Conta, Meta } from "../api/tipos";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { hojeLocal, periodoAtual, rotulo } from "../periodo/periodo";
import { entrarNaSimulacao } from "../simulacao/fetchSimulado";
import { Orcamento } from "./Orcamento";

// Contra o fetch simulado (vazio e sem sessão a cada teste, pelo preparar.ts;
// aqui com a sessão aberta). O mês é o atual, e os dados têm a data de hoje.
beforeEach(() => {
  entrarNaSimulacao();
});

const NBSP = "\u{a0}";
const PONTO_MEDIO = "·";

function navegacao(aoIrPara = vi.fn()): Navegacao {
  return { nomeDaPessoa: "Você", tela: "orcamento", aoIrPara, aoSair: vi.fn() };
}

async function conta(): Promise<Conta> {
  return chamar<Conta>("/contas", { metodo: "POST", corpo: { nome: "Nubank", saldo_inicial: "0.00" } });
}

async function ganho(contaId: string, valor: string): Promise<void> {
  await chamar("/ganhos", {
    metodo: "POST",
    corpo: { conta_id: contaId, valor, descricao: "Salário", data: hojeLocal(), tags: [] },
  });
}

async function gasto(contaId: string, valor: string, categoria: string): Promise<void> {
  await chamar("/gastos", {
    metodo: "POST",
    corpo: { conta_id: contaId, valor, descricao: "Compra", data: hojeLocal(), categoria, tags: [] },
  });
}

async function definirMeta(categoria: string, percentual: number): Promise<void> {
  await chamar<Meta>(`/metas/${categoria}`, { metodo: "PUT", corpo: { percentual } });
}

function linha(nome: string): HTMLElement {
  return screen.getByRole("listitem", { name: nome });
}

function rendaDoMes(): string {
  return screen.getByRole("group", { name: /^Renda do mês/ }).textContent ?? "";
}

function gastoAteAgora(): string {
  return screen.getByRole("group", { name: /^Gasto até agora/ }).textContent ?? "";
}

/** A faixa da projeção que contém a frase dada (texto folha). */
async function faixaDaProjecao(frase: string | RegExp): Promise<HTMLElement> {
  const texto = await screen.findByText(frase);
  return texto.closest("[data-situacao]") as HTMLElement;
}

async function esperarTela(): Promise<void> {
  await screen.findByRole("button", { name: "Editar metas" });
  await waitFor(() => expect(screen.queryByText("Carregando as categorias…")).toBeNull());
}

/** Entra no modo de edição e espera o editor das categorias. */
async function editarMetas(): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: "Editar metas" }));
  await screen.findByRole("listitem", { name: "Lazer" });
}

function concluir(): void {
  fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
}

function campoDe(nome: string): HTMLInputElement {
  return screen.getByLabelText(`Percentual da renda para ${nome}`) as HTMLInputElement;
}

async function salvarMeta(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Salvar meta" }));
  expect(await screen.findByText("Meta salva.")).toBeTruthy();
}

function menuDaMeta(nome: string): HTMLElement {
  return screen.getByRole("button", { name: `Mais ações da meta ${nome}` });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Orcamento", () => {
  it("mostra o mês atual, a renda e, sem metas, o convite para editá-las", async () => {
    render(<Orcamento navegacao={navegacao()} />);

    expect(screen.getByRole("heading", { level: 2, name: "Orçamento" })).toBeTruthy();
    expect(screen.getByText(rotulo(periodoAtual()))).toBeTruthy();
    await esperarTela();
    expect(await screen.findByText("Nenhuma meta ainda")).toBeTruthy();
    expect(screen.getByText(/Metas somam 0% \(sobram 100%\)/)).toBeTruthy();
  });

  it("tem cabeçalho com subtítulo, um só h1 e seções separadas por título", async () => {
    render(<Orcamento navegacao={navegacao()} />);
    await esperarTela();

    expect(screen.getByText("Quanto da renda cada categoria pode usar.")).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "Renda e projeção" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Metas por categoria" })).toBeTruthy();
  });

  it("resume renda, gasto, renda-base e projeção em quatro indicadores", async () => {
    render(<Orcamento navegacao={navegacao()} />);
    await esperarTela();
    for (const rotulo of ["Renda-base mensal", "Renda do mês", "Gasto até agora", "Projeção do mês"]) {
      expect(screen.getByRole("group", { name: rotulo })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Sobre Renda-base mensal" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sobre Projeção do mês" })).toBeTruthy();
  });

  it("lê por padrão: nenhum botão de definir, alterar ou remover, nem de renda-base", async () => {
    await definirMeta("lazer", 20);
    render(<Orcamento navegacao={navegacao()} />);
    await esperarTela();
    await screen.findByRole("img", { name: /^Lazer: / });

    expect(screen.queryByRole("button", { name: /^Definir meta/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Alterar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remover/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^(Definir|Alterar|Remover) renda-base/ })).toBeNull();
    expect(screen.queryByLabelText("Percentual da renda para Lazer")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Mais ações/ })).toBeNull();
  });

  it("diz em texto quando as metas já distribuem toda a renda", async () => {
    await definirMeta("lazer", 100);
    render(<Orcamento navegacao={navegacao()} />);
    await esperarTela();

    expect(await screen.findByText("Renda toda distribuída")).toBeTruthy();
    expect(screen.getByText(/Metas somam 100% \(sobram 0%\)/)).toBeTruthy();
  });

  it("Editar metas mostra o editor de todas as categorias; Concluir volta à leitura", async () => {
    render(<Orcamento navegacao={navegacao()} />);
    await esperarTela();

    await editarMetas();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(5);
    expect(campoDe("Lazer")).toBeTruthy();
    expect(campoDe("Gasto fixo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Concluir" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar metas" })).toBeNull();

    concluir();
    expect(screen.queryByLabelText("Percentual da renda para Lazer")).toBeNull();
    expect(screen.getByRole("button", { name: "Editar metas" })).toBeTruthy();
  });

  it("define uma meta: o percentual vira reais da renda do mês e a linha mostra o progresso", async () => {
    const c = await conta();
    await ganho(c.id, "5000.00");
    await gasto(c.id, "450.00", "lazer");
    render(<Orcamento navegacao={navegacao()} />);
    await esperarTela();
    await waitFor(() => expect(rendaDoMes()).toContain(`R$${NBSP}5.000,00`));

    await editarMetas();
    fireEvent.change(campoDe("Lazer"), { target: { value: "10" } });
    expect(screen.getByText(/10% equivale a/).textContent).toContain(`R$${NBSP}500,00`);
    await salvarMeta();
    expect(document.activeElement).toBe(campoDe("Lazer"));
    concluir();

    const barra = await within(linha("Lazer")).findByRole("img", { name: /^Lazer: / });
    expect(barra.getAttribute("aria-label")).toContain("90% usado");
    expect(linha("Lazer").textContent).toContain(`Restam R$${NBSP}50,00`);
    expect(linha("Lazer").textContent).toContain(`R$${NBSP}450,00 de R$${NBSP}500,00`);
    expect(screen.getByText(/Metas somam 10% \(sobram 90%\)/)).toBeTruthy();
  });

  it("a barra deslizante muda o percentual, o valor em reais e salva", async () => {
    const c = await conta();
    await ganho(c.id, "5000.00");
    render(<Orcamento navegacao={navegacao()} />);
    await esperarTela();
    await waitFor(() => expect(rendaDoMes()).toContain(`R$${NBSP}5.000,00`));

    await editarMetas();
    fireEvent.change(screen.getByLabelText("Ajustar o percentual de Lazer"), { target: { value: "25" } });
    expect(campoDe("Lazer").value).toBe("25");
    expect(screen.getByText(/25% equivale a/).textContent).toContain(`R$${NBSP}1.250,00`);
    await salvarMeta();

    await waitFor(() => expect(screen.getByText(/Metas somam 25% \(sobram 75%\)/)).toBeTruthy());
    const legenda = screen.getByRole("list", { name: "Legenda da divisão da renda" });
    expect(legenda.textContent).toContain("Lazer 25%");
    expect(legenda.textContent).toContain("Sem destino 75%");
    expect(legenda.textContent).not.toContain("R$");
    concluir();
    await waitFor(() => expect(linha("Lazer").textContent).toContain(`R$${NBSP}0,00 de R$${NBSP}1.250,00`));
  });

  it("a barra deslizante também avisa quando a soma passa de 100%", async () => {
    await definirMeta("gasto_fixo", 80);
    render(<Orcamento navegacao={navegacao()} />);
    await esperarTela();
    await editarMetas();
    await waitFor(() => expect(campoDe("Gasto fixo").value).toBe("80"));

    fireEvent.change(screen.getByLabelText("Ajustar o percentual de Lazer"), { target: { value: "30" } });

    expect(screen.getByRole("alert").textContent).toContain("110%");
    expect((screen.getByRole("button", { name: "Salvar meta" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("estourar a meta aparece em texto, com o valor positivo do excesso", async () => {
    const c = await conta();
    await ganho(c.id, "1000.00");
    await gasto(c.id, "150.00", "lazer");
    await definirMeta("lazer", 10);
    render(<Orcamento navegacao={navegacao()} />);

    await waitFor(() => expect(linha("Lazer").textContent).toContain(`Passou R$${NBSP}50,00`));
  });

  it("soma acima de 100%: avisa que a meta está extrapolando e não envia nada", async () => {
    await definirMeta("gasto_fixo", 80);
    render(<Orcamento navegacao={navegacao()} />);
    await esperarTela();
    await editarMetas();
    await waitFor(() => expect(campoDe("Gasto fixo").value).toBe("80"));

    fireEvent.change(campoDe("Lazer"), { target: { value: "30" } });

    expect(screen.getByRole("alert").textContent).toBe("A soma das metas está em 110%: passa de 100% da renda.");
    expect((screen.getByRole("button", { name: "Salvar meta" }) as HTMLButtonElement).disabled).toBe(true);
    const metas = await chamar<Meta[]>("/metas");
    expect(metas).toEqual([{ categoria: "gasto_fixo", nome: "Gasto fixo", percentual: 80 }]);

    fireEvent.change(campoDe("Lazer"), { target: { value: "20" } });
    expect((screen.getByRole("button", { name: "Salvar meta" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("altera o percentual de uma meta que já existe sem contá-la em dobro na soma", async () => {
    await definirMeta("lazer", 60);
    render(<Orcamento navegacao={navegacao()} />);
    await esperarTela();
    await editarMetas();
    await waitFor(() => expect(campoDe("Lazer").value).toBe("60"));
    expect(screen.queryByRole("button", { name: "Salvar meta" })).toBeNull();

    fireEvent.change(campoDe("Lazer"), { target: { value: "100" } });
    expect(screen.queryByRole("alert")).toBeNull();
    await salvarMeta();

    await waitFor(() => expect(screen.getByText(/Metas somam 100% \(sobram 0%\)/)).toBeTruthy());
  });

  it("remove a meta pelo menu e confirma no diálogo, com o foco em Cancelar", async () => {
    await definirMeta("lazer", 20);
    render(<Orcamento navegacao={navegacao()} />);
    await esperarTela();
    await editarMetas();
    await waitFor(() => expect(campoDe("Lazer").value).toBe("20"));

    fireEvent.click(menuDaMeta("Lazer"));
    const item = screen.getByRole("menuitem", { name: "Remover a meta de Lazer" });
    expect(item.hasAttribute("data-destrutivo")).toBe(true);
    fireEvent.click(item);

    expect(screen.getByRole("heading", { name: "Remover a meta de Lazer?" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar remoção" }));

    expect(await screen.findByText("Meta removida.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Mais ações da meta Lazer" })).toBeNull());
    expect(await chamar<Meta[]>("/metas")).toEqual([]);
    // O gatilho some com a meta: o foco vai ao campo da categoria.
    await waitFor(() => expect(document.activeElement).toBe(campoDe("Lazer")));
  });

  it("Esc cancela a remoção e devolve o foco ao gatilho do menu", async () => {
    await definirMeta("lazer", 20);
    render(<Orcamento navegacao={navegacao()} />);
    await esperarTela();
    await editarMetas();
    await waitFor(() => expect(campoDe("Lazer").value).toBe("20"));

    fireEvent.click(menuDaMeta("Lazer"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remover a meta de Lazer" }));
    const dialogo = screen.getByRole("heading", { name: "Remover a meta de Lazer?" }).closest("dialog") as HTMLDialogElement;
    fireEvent(dialogo, new Event("cancel", { cancelable: true }));

    expect(dialogo.open).toBe(false);
    expect(document.activeElement).toBe(menuDaMeta("Lazer"));
    expect(await chamar<Meta[]>("/metas")).toHaveLength(1);
  });

  it("trocar o mês mantém o modo de edição", async () => {
    render(<Orcamento navegacao={navegacao()} />);
    await esperarTela();
    await editarMetas();

    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));

    expect(screen.getByRole("button", { name: "Concluir" })).toBeTruthy();
    expect(campoDe("Lazer")).toBeTruthy();
  });

  it("trocar o mês consulta o progresso do outro mês", async () => {
    const c = await conta();
    await ganho(c.id, "5000.00");
    render(<Orcamento navegacao={navegacao()} />);
    await waitFor(() => expect(rendaDoMes()).toContain(`R$${NBSP}5.000,00`));

    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));

    await waitFor(() => expect(rendaDoMes()).toContain(`R$${NBSP}0,00`));
  });

  it("servidor fora do ar avisa", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    render(<Orcamento navegacao={navegacao()} />);

    expect(
      await screen.findByText("Não foi possível falar com o servidor. Confira se a API está rodando."),
    ).toBeTruthy();
  });

  it("a lista de leitura traz uma linha por meta, com a barra de progresso e sem separadores", async () => {
    await definirMeta("lazer", 10);
    await definirMeta("gasto_fixo", 30);
    render(<Orcamento navegacao={navegacao()} />);
    await esperarTela();

    const lista = await screen.findByRole("list", { name: "Metas por categoria" });
    await waitFor(() => expect(within(lista).getAllByRole("listitem")).toHaveLength(2));
    const anel = await within(linha("Lazer")).findByRole("img", { name: /^Lazer: / });
    expect(anel.getAttribute("role")).toBe("img");
    expect(lista.textContent).not.toContain(PONTO_MEDIO);
  });

  it("a troca de mês fica no grupo Período da página", async () => {
    render(<Orcamento navegacao={navegacao()} />);

    const periodo = screen.getByRole("group", { name: "Período" });
    expect(within(periodo).getByText(rotulo(periodoAtual()))).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Mês" })).toBeNull();
  });

  describe("painel dos lançamentos da meta", () => {
    it("abre pela linha, lista os lançamentos do mês e o Esc devolve o foco ao botão da linha", async () => {
      const c = await conta();
      await ganho(c.id, "5000.00");
      await gasto(c.id, "80.00", "lazer");
      await definirMeta("lazer", 10);
      render(<Orcamento navegacao={navegacao()} />);
      await esperarTela();

      const abrir = await screen.findByRole("button", { name: "Ver lançamentos de Lazer" });
      fireEvent.click(abrir);

      expect(screen.getByRole("heading", { name: `Lazer em ${rotulo(periodoAtual())}` })).toBeTruthy();
      const dialogo = document.querySelector("dialog[open]") as HTMLDialogElement;
      await waitFor(() => expect(within(dialogo).getByText("Compra")).toBeTruthy());
      expect(dialogo.textContent).toContain(`R$${NBSP}80,00`);
      expect(dialogo.textContent).toContain("Nubank");

      fireEvent(dialogo, new Event("cancel", { cancelable: true }));
      expect(document.querySelector("dialog[open]")).toBeNull();
      expect(document.activeElement).toBe(abrir);
    });

    it("sem lançamentos mostra o vazio e 'Ver Transações' leva a Transações", async () => {
      await definirMeta("lazer", 10);
      const aoIrPara = vi.fn();
      render(<Orcamento navegacao={navegacao(aoIrPara)} />);
      await esperarTela();

      fireEvent.click(await screen.findByRole("button", { name: "Ver lançamentos de Lazer" }));
      await waitFor(() => expect(screen.getByText("Nenhum lançamento nesta meta no mês")).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: "Ver Transações" }));

      expect(aoIrPara).toHaveBeenCalledWith("transacoes");
    });
  });

  describe("faixa de resumo e projeção", () => {
    async function prepararDia10(): Promise<void> {
      // Os dados são criados no dia de hoje real; só então o relógio vai ao dia 10 do mês.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 9, 10, 12));
      const c = await conta();
      const dados = { conta_id: c.id, descricao: "x", tags: [] };
      await chamar("/ganhos", { metodo: "POST", corpo: { ...dados, valor: "1000.00", data: "2026-10-03" } });
      await chamar("/gastos", {
        metodo: "POST",
        corpo: { ...dados, valor: "300.00", data: "2026-10-05", categoria: "lazer" },
      });
    }

    it("mostra a renda, o gasto até agora e a projeção do mês corrente, com 'Sobram' em elemento próprio", async () => {
      await prepararDia10();
      render(<Orcamento navegacao={navegacao()} />);

      // dia 10 de 31: 300 * 31 / 10 = 930,00
      await waitFor(() => expect(rendaDoMes()).toContain(`R$${NBSP}1.000,00`));
      await waitFor(() => expect(gastoAteAgora()).toContain(`R$${NBSP}300,00`));
      const projecao = await faixaDaProjecao("Cabe na renda");
      expect(projecao.textContent).toContain(`R$${NBSP}930,00`);
      expect(projecao.textContent).toContain(`Sobram R$${NBSP}70,00`);
      expect(projecao.textContent).not.toContain(PONTO_MEDIO);
      expect(within(projecao).getByText(`Sobram R$${NBSP}70,00`, { normalizer: (t) => t })).toBeTruthy();
    });

    it("a explicação da projeção fica dentro da Dica", async () => {
      await prepararDia10();
      render(<Orcamento navegacao={navegacao()} />);
      const projecao = await faixaDaProjecao("Cabe na renda");

      expect(within(projecao).getByRole("button", { name: "Sobre Projeção do mês" })).toBeTruthy();
      const textos = Array.from(document.querySelectorAll("[data-dica] [id]")).filter(
        (e) => /^Estimativa simples/.test(e.textContent ?? ""),
      );
      expect(textos).toHaveLength(1);
      expect((textos[0] as HTMLElement).hidden).toBe(true);
    });

    it("gasto com data depois de hoje fica fora do até agora e da estimativa", async () => {
      await prepararDia10();
      const [c] = await chamar<Conta[]>("/contas");
      await chamar("/gastos", {
        metodo: "POST",
        corpo: { conta_id: c.id, valor: "400.00", descricao: "y", data: "2026-10-20", categoria: "lazer", tags: [] },
      });
      render(<Orcamento navegacao={navegacao()} />);

      await waitFor(() => expect(gastoAteAgora()).toContain(`R$${NBSP}300,00`));
      const projecao = await faixaDaProjecao("Cabe na renda");
      expect(projecao.textContent).toContain(`R$${NBSP}930,00`);
    });

    it("no dia 2 só mostra o gasto até agora, sem estimativa", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 9, 2, 12));
      const c = await conta();
      await chamar("/gastos", {
        metodo: "POST",
        corpo: { conta_id: c.id, valor: "300.00", descricao: "y", data: "2026-10-01", categoria: "lazer", tags: [] },
      });
      render(<Orcamento navegacao={navegacao()} />);

      expect(
        await screen.findByText((_, el) => el !== null && el.children.length === 0 && /^Poucos dias de dados/.test(el.textContent ?? "")),
      ).toBeTruthy();
      expect(screen.queryByText(/Cabe na renda|Passa da renda/)).toBeNull();
    });

    it("sem renda no mês a projeção aparece sem comparação", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 9, 10, 12));
      const c = await conta();
      await gasto(c.id, "300.00", "lazer");
      render(<Orcamento navegacao={navegacao()} />);

      expect(await screen.findByText("Sem renda registrada neste mês")).toBeTruthy();
      expect(screen.queryByText(/Cabe na renda|Passa da renda/)).toBeNull();
    });

    it("mês passado mostra Fechou em, e voltar ao mês corrente traz a projeção de volta", async () => {
      await prepararDia10();
      render(<Orcamento navegacao={navegacao()} />);
      await screen.findByText("Cabe na renda");

      fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
      expect(await screen.findByText("O mês ainda não começou")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
      fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
      expect(await screen.findByText(/^Fechou em/)).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
      expect(await screen.findByText("Cabe na renda")).toBeTruthy();
    });
  });
});

describe("renda-base no Orçamento", () => {
  const textoDeContexto = (texto: string) =>
    screen.getByText((_, el) => el !== null && el.children.length === 0 && el.textContent === texto);

  it("é um dado rotulado: sem edição só mostra o valor e uma linha de contexto", async () => {
    render(<Orcamento navegacao={navegacao()} />);

    expect(await screen.findByText("Não definida")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Renda-base mensal" })).toBeTruthy();
    expect(textoDeContexto("Metas calculadas sobre a renda registrada no mês")).toBeTruthy();
    expect(screen.queryByText(/Metas calculadas sobre:/)).toBeNull();
    expect(screen.queryByText(/Registrada acima da base em/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Definir renda-base" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sobre Renda-base mensal" })).toBeTruthy();
  });

  it("define, altera e remove com confirmação, mantendo renda e projeção reais", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 10, 12));
    const c = await conta();
    await ganho(c.id, "1000.00");
    await gasto(c.id, "300.00", "lazer");
    await definirMeta("lazer", 20);
    render(<Orcamento navegacao={navegacao()} />);
    await esperarTela();
    expect(await screen.findByText("Não definida")).toBeTruthy();
    const projecaoAntes = (await faixaDaProjecao("Cabe na renda")).textContent;
    await editarMetas();

    fireEvent.click(screen.getByRole("button", { name: "Mais ações da renda-base" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Definir renda-base" }));
    const campo = screen.getByLabelText("Valor da renda-base mensal");
    expect(document.activeElement).toBe(campo);
    fireEvent.change(campo, { target: { value: "500000" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar renda-base" }));
    expect(await screen.findByText("Renda-base salva.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Mais ações da renda-base" })));
    await waitFor(() => expect(textoDeContexto("Renda real: R$ 4.000,00 abaixo")).toBeTruthy());
    expect(screen.getByText("Divisão da renda-base")).toBeTruthy();
    expect(rendaDoMes()).toContain(`R$${NBSP}1.000,00`);
    expect((await faixaDaProjecao("Cabe na renda")).textContent).toBe(projecaoAntes);
    expect(screen.getByRole("list", { name: "Legenda da divisão da renda" }).textContent).toContain("Lazer 20%");
    expect(screen.getByText(/20% equivale a/).textContent).toContain(`R$${NBSP}1.000,00`);

    fireEvent.click(screen.getByRole("button", { name: "Mais ações da renda-base" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Alterar renda-base" }));
    fireEvent.change(screen.getByLabelText("Valor da renda-base mensal"), { target: { value: "600000" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar renda-base" }));
    await waitFor(() => expect(screen.getByText(/20% equivale a/).textContent).toContain(`R$${NBSP}1.200,00`));

    fireEvent.click(screen.getByRole("button", { name: "Mais ações da renda-base" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remover renda-base" }));
    expect(screen.getByRole("heading", { name: "Remover a renda-base?" })).toBeTruthy();
    expect(screen.getByText("As metas voltarão a usar a renda registrada.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));
    expect((await chamar<{ valor: string }>("/renda-base")).valor).toBe("6000.00");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar remoção da renda-base" }));
    expect(await screen.findByText("Renda-base removida.")).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/20% equivale a/).textContent).toContain(`R$${NBSP}200,00`));
    expect(textoDeContexto("Metas calculadas sobre a renda registrada no mês")).toBeTruthy();
    expect((await faixaDaProjecao("Cabe na renda")).textContent).toBe(projecaoAntes);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Mais ações da renda-base" })));
  });

  it("ganhos acima da base mostram a diferença na mesma frase e não mudam a referência", async () => {
    const c = await conta();
    await ganho(c.id, "7000.00");
    await chamar("/renda-base", { metodo: "PUT", corpo: { valor: "5000.00" } });
    await definirMeta("lazer", 20);
    render(<Orcamento navegacao={navegacao()} />);
    await esperarTela();

    await waitFor(() =>
      expect(
        screen.getByText(
          (_, el) =>
            el !== null &&
            el.children.length === 0 &&
            el.textContent === `Renda real: +R$${NBSP}2.000,00 acima`,
        ),
      ).toBeTruthy(),
    );
    await waitFor(() => expect(linha("Lazer").textContent).toContain(`R$${NBSP}1.000,00`));
    expect(rendaDoMes()).toContain(`R$${NBSP}7.000,00`);
  });

  it("não envia base zero e mostra erro da API junto ao campo", async () => {
    render(<Orcamento navegacao={navegacao()} />);
    await esperarTela();
    await editarMetas();
    fireEvent.click(screen.getByRole("button", { name: "Mais ações da renda-base" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Definir renda-base" }));
    expect((screen.getByRole("button", { name: "Salvar renda-base" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Valor da renda-base mensal"), { target: { value: "500000" } });
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
      if (String(entrada).endsWith("/renda-base") && opcoes?.method === "PUT") {
        return Promise.resolve(new Response(JSON.stringify({ erro: { codigo: "valor_invalido", mensagem: "Base recusada no exemplo." } }), { status: 422 }));
      }
      return original(entrada, opcoes);
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar renda-base" }));
    expect(await screen.findByText("Base recusada no exemplo.")).toBeTruthy();
    expect(screen.getByLabelText("Valor da renda-base mensal").getAttribute("aria-describedby")).toBeTruthy();
  });

  it("devolve o foco ao botão Alterar ao cancelar a edição e ao gatilho do menu ao cancelar a remoção", async () => {
    await chamar("/renda-base", { metodo: "PUT", corpo: { valor: "5000.00" } });
    render(<Orcamento navegacao={navegacao()} />);
    await esperarTela();
    await editarMetas();
    fireEvent.click(screen.getByRole("button", { name: "Mais ações da renda-base" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Alterar renda-base" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Mais ações da renda-base" }));

    const gatilho = screen.getByRole("button", { name: "Mais ações da renda-base" });
    fireEvent.click(gatilho);
    fireEvent.click(screen.getByRole("menuitem", { name: "Remover renda-base" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(document.activeElement).toBe(gatilho);
    expect((await chamar<{ valor: string }>("/renda-base")).valor).toBe("5000.00");
  });

  it("Concluir fecha a edição da renda-base que ficou aberta", async () => {
    render(<Orcamento navegacao={navegacao()} />);
    await esperarTela();
    await editarMetas();
    fireEvent.click(screen.getByRole("button", { name: "Mais ações da renda-base" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Definir renda-base" }));
    expect(screen.getByLabelText("Valor da renda-base mensal")).toBeTruthy();

    concluir();

    expect(screen.queryByLabelText("Valor da renda-base mensal")).toBeNull();
  });
});

describe("Liberdade financeira no Orçamento", () => {
  it("usa alvos próprios e a explicação vive só na Dica, ligada à barra por aria-describedby", async () => {
    await definirMeta("liberdade_financeira", 10);
    render(<Orcamento navegacao={navegacao()} />);
    await esperarTela();

    const item = await screen.findByRole("listitem", { name: "Liberdade financeira" });
    const barra = within(item).getByRole("img", { name: /^Liberdade financeira: / });
    const texto = document.getElementById(barra.getAttribute("aria-describedby") as string) as HTMLElement;
    expect(texto.textContent).toContain("Aportes não são gastos");
    expect(texto.hidden).toBe(true);
    fireEvent.click(within(item).getByRole("button", { name: "Sobre a Liberdade financeira" }));
    expect(texto.hidden).toBe(false);
    expect(screen.queryByRole("listitem", { name: "Investimentos" })).toBeNull();
  });
});
