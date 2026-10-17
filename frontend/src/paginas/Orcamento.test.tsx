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

function navegacao(): Navegacao {
  return { nomeDaPessoa: "Você", tela: "orcamento", aoIrPara: vi.fn(), aoSair: vi.fn() };
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

function cartao(nome: string): HTMLElement {
  return screen.getByRole("listitem", { name: nome });
}

// O normalizador padrão do findByText troca o NBSP por espaço; aqui o texto é comparado cru.
const CABE_70 = (_: string, el: Element | null) =>
  el !== null && el.children.length === 0 && el.textContent === `Cabe na renda · sobram R$${NBSP}70,00`;

function rendaDoMes(): string {
  return screen.getByRole("group", { name: /^Renda do mês/ }).textContent ?? "";
}

function gastoAteAgora(): string {
  return screen.getByRole("group", { name: /^Gasto até agora/ }).textContent ?? "";
}

async function esperarCartoes(): Promise<void> {
  await screen.findByRole("listitem", { name: "Lazer" });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Orcamento", () => {
  it("mostra o mês atual, a renda e as cinco categorias, todas sem meta no começo", async () => {
    render(<Orcamento navegacao={navegacao()} />);

    expect(screen.getByRole("heading", { level: 2, name: "Metas" })).toBeTruthy();
    expect(screen.getByText(rotulo(periodoAtual()))).toBeTruthy();
    await esperarCartoes();
    expect(screen.getAllByText("Sem meta")).toHaveLength(5);
    expect(screen.getByText(/Metas somam 0% \(sobram 100%\)/)).toBeTruthy();
  });

  it("define uma meta: o percentual vira reais da renda do mês e o progresso aparece", async () => {
    const c = await conta();
    await ganho(c.id, "5000.00");
    await gasto(c.id, "450.00", "lazer");
    render(<Orcamento navegacao={navegacao()} />);
    await esperarCartoes();
    await waitFor(() => expect(rendaDoMes()).toContain(`R$${NBSP}5.000,00`));

    fireEvent.click(screen.getByRole("button", { name: "Definir meta de Lazer" }));
    const campo = screen.getByLabelText("Percentual da renda para Lazer");
    fireEvent.change(campo, { target: { value: "10" } });
    expect(screen.getByText(/10% equivale a/).textContent).toContain(`R$${NBSP}500,00`);
    fireEvent.click(screen.getByRole("button", { name: "Salvar meta" }));

    expect(await screen.findByText("Meta salva.")).toBeTruthy();
    const medidor = await within(cartao("Lazer")).findByRole("progressbar", { name: "Meta de Lazer" });
    expect(medidor.getAttribute("aria-valuenow")).toBe("90");
    expect(cartao("Lazer").textContent).toContain("Perto do limite");
    expect(screen.getByText(/Metas somam 10% \(sobram 90%\)/)).toBeTruthy();
  });

  it("a barra deslizante muda o percentual, o valor em reais e salva", async () => {
    const c = await conta();
    await ganho(c.id, "5000.00");
    render(<Orcamento navegacao={navegacao()} />);
    await esperarCartoes();
    await waitFor(() => expect(rendaDoMes()).toContain(`R$${NBSP}5.000,00`));

    fireEvent.click(screen.getByRole("button", { name: "Definir meta de Lazer" }));
    fireEvent.change(screen.getByLabelText("Ajustar o percentual de Lazer"), { target: { value: "25" } });
    expect((screen.getByLabelText("Percentual da renda para Lazer") as HTMLInputElement).value).toBe("25");
    expect(screen.getByText(/25% equivale a/).textContent).toContain(`R$${NBSP}1.250,00`);
    fireEvent.click(screen.getByRole("button", { name: "Salvar meta" }));

    expect(await screen.findByText("Meta salva.")).toBeTruthy();
    await waitFor(() => expect(cartao("Lazer").textContent).toContain(`Meta de R$${NBSP}1.250,00`));
    const legenda = screen.getByRole("list", { name: "Legenda da divisão da renda" });
    expect(legenda.textContent).toContain(`Lazer · 25% · R$${NBSP}1.250,00`);
    expect(legenda.textContent).toContain(`Sem destino · 75% · R$${NBSP}3.750,00`);
  });

  it("a barra deslizante também avisa quando a soma passa de 100%", async () => {
    await definirMeta("gasto_fixo", 80);
    render(<Orcamento navegacao={navegacao()} />);
    await esperarCartoes();
    await waitFor(() => expect(cartao("Gasto fixo").textContent).toContain("80% da renda"));

    fireEvent.click(screen.getByRole("button", { name: "Definir meta de Lazer" }));
    fireEvent.change(screen.getByLabelText("Ajustar o percentual de Lazer"), { target: { value: "30" } });
    expect(screen.getByRole("alert").textContent).toContain("110%");
    expect((screen.getByRole("button", { name: "Salvar meta" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("estourar a meta aparece em texto", async () => {
    const c = await conta();
    await ganho(c.id, "1000.00");
    await gasto(c.id, "150.00", "lazer");
    await definirMeta("lazer", 10);
    render(<Orcamento navegacao={navegacao()} />);

    await waitFor(() => expect(cartao("Lazer").textContent).toContain(`Estourou em R$${NBSP}50,00`));
  });

  it("soma acima de 100%: avisa que a meta está extrapolando e não envia nada", async () => {
    await definirMeta("gasto_fixo", 80);
    render(<Orcamento navegacao={navegacao()} />);
    await esperarCartoes();
    await waitFor(() => expect(cartao("Gasto fixo").textContent).toContain("80% da renda"));

    fireEvent.click(screen.getByRole("button", { name: "Definir meta de Lazer" }));
    fireEvent.change(screen.getByLabelText("Percentual da renda para Lazer"), { target: { value: "30" } });

    expect(screen.getByRole("alert").textContent).toBe("A soma das metas está em 110%: passa de 100% da renda.");
    expect((screen.getByRole("button", { name: "Salvar meta" }) as HTMLButtonElement).disabled).toBe(true);
    const metas = await chamar<Meta[]>("/metas");
    expect(metas).toEqual([{ categoria: "gasto_fixo", percentual: 80 }]);

    fireEvent.change(screen.getByLabelText("Percentual da renda para Lazer"), { target: { value: "20" } });
    expect((screen.getByRole("button", { name: "Salvar meta" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("altera o percentual de uma meta que já existe sem contá-la em dobro na soma", async () => {
    await definirMeta("lazer", 60);
    render(<Orcamento navegacao={navegacao()} />);
    await esperarCartoes();
    await waitFor(() => expect(cartao("Lazer").textContent).toContain("60% da renda"));

    fireEvent.click(screen.getByRole("button", { name: "Alterar a meta de Lazer" }));
    fireEvent.change(screen.getByLabelText("Percentual da renda para Lazer"), { target: { value: "100" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Salvar meta" }));

    expect(await screen.findByText("Meta salva.")).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Metas somam 100% \(sobram 0%\)/)).toBeTruthy());
  });

  it("remove a meta depois de confirmar", async () => {
    await definirMeta("lazer", 20);
    render(<Orcamento navegacao={navegacao()} />);
    await esperarCartoes();
    await waitFor(() => expect(cartao("Lazer").textContent).toContain("20% da renda"));

    fireEvent.click(screen.getByRole("button", { name: "Remover a meta de Lazer" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar remoção" }));

    expect(await screen.findByText("Meta removida.")).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText("Sem meta")).toHaveLength(5));
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

  it("a grade traz um cartão por categoria e o anel mantém o papel e o nome", async () => {
    await definirMeta("lazer", 10);
    render(<Orcamento navegacao={navegacao()} />);
    await esperarCartoes();

    const lista = screen.getByRole("list", { name: "Metas por categoria" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(5);
    const medidor = await within(cartao("Lazer")).findByRole("progressbar", { name: "Meta de Lazer" });
    expect(medidor.getAttribute("role")).toBe("progressbar");
  });

  it("a troca de mês fica no grupo Período da página", async () => {
    render(<Orcamento navegacao={navegacao()} />);

    const periodo = screen.getByRole("group", { name: "Período" });
    expect(within(periodo).getByText(rotulo(periodoAtual()))).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Mês" })).toBeNull();
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

    it("mostra a renda, o gasto até agora e a projeção do mês corrente", async () => {
      await prepararDia10();
      render(<Orcamento navegacao={navegacao()} />);

      // dia 10 de 31: 300 * 31 / 10 = 930,00
      await waitFor(() => expect(rendaDoMes()).toContain(`R$${NBSP}1.000,00`));
      await waitFor(() => expect(gastoAteAgora()).toContain(`R$${NBSP}300,00`));
      const projecao = await screen.findByText(CABE_70);
      expect(projecao.closest("[data-situacao]")?.textContent).toContain(`R$${NBSP}930,00`);
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
      const projecao = await screen.findByText(CABE_70);
      expect(projecao.closest("[data-situacao]")?.textContent).toContain(`R$${NBSP}930,00`);
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
      await screen.findByText(CABE_70);

      fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
      expect(await screen.findByText("O mês ainda não começou")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
      fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
      expect(await screen.findByText(/^Fechou em/)).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
      expect(await screen.findByText(CABE_70)).toBeTruthy();
    });
  });
});
