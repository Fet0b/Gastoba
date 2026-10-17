import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "../App";
import { chamar } from "../api/cliente";
import type { Conta } from "../api/tipos";
import { entrarNaSimulacao, reiniciarSimulacao } from "../simulacao/fetchSimulado";
import { definirLayoutEstreito, definirMidia } from "./preparar";

// Integração do App contra o fetch simulado (vazio e sem sessão a cada teste,
// pelo preparar.ts): o portão da sessão, a navegação por estado e as telas.
const EMAIL = "voce@exemplo.com";
const SENHA = "senha-de-exemplo-123";

async function entrarPelaTela(): Promise<void> {
  fireEvent.change(await screen.findByLabelText("E-mail"), { target: { value: EMAIL } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: SENHA } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
  await screen.findByRole("heading", { name: "Metas do mês" });
}

function irPara(aba: string): void {
  const navegacao = screen.getByRole("navigation", { name: "Telas" });
  fireEvent.click(within(navegacao).getByRole("button", { name: aba }));
}

/** Em Transações, repete "Novo gasto" até as contas chegarem e o compositor abrir. */
async function abrirCompositor(): Promise<HTMLElement> {
  await waitFor(() => {
    fireEvent.click(screen.getByRole("button", { name: "Novo gasto" }));
    expect(screen.getByRole("dialog", { name: "Novo gasto" })).not.toBeNull();
  });
  return screen.getByRole("dialog", { name: "Novo gasto" });
}

describe("App", () => {
  it("enquanto verifica a sessão, mostra um carregamento acessível", async () => {
    render(<App />);

    const carregando = screen.getByRole("status");
    expect(carregando.textContent).toBe("Verificando a sessão…");
    expect(await screen.findByLabelText("E-mail")).not.toBeNull();
  });

  it("criar conta: abre o cadastro pela tela de entrar, cria a pessoa e já abre o Início", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Criar conta" }));
    fireEvent.change(await screen.findByLabelText("Nome"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "ana@exemplo.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "uma-senha-bem-grande" } });
    fireEvent.change(screen.getByLabelText("Confirme a senha"), {
      target: { value: "uma-senha-bem-grande" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByRole("heading", { name: "Metas do mês" })).not.toBeNull();
    irPara("Perfil");
    expect(within(screen.getByRole("main")).getByText("Ana")).not.toBeNull();
  });

  it("entra em Início e cada aba abre a página certa", async () => {
    entrarNaSimulacao();
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });
    expect(screen.getByRole("button", { name: "Início" }).getAttribute("aria-current")).toBe("page");

    const paginas: [string, () => HTMLElement][] = [
      ["Transações", () => screen.getByRole("heading", { level: 2, name: "Transações" })],
      ["Orçamento", () => screen.getByRole("heading", { level: 2, name: "Metas" })],
      ["Contas", () => screen.getByRole("heading", { level: 2, name: "Contas" })],
      ["Faturas", () => screen.getByRole("heading", { level: 2, name: "Faturas" })],
      ["Tags", () => screen.getByRole("heading", { name: "Distribuição por tags" })],
      ["Outros", () => screen.getByRole("heading", { level: 2, name: "Outros" })],
      ["Perfil", () => screen.getByRole("heading", { level: 2, name: "Perfil" })],
      ["Início", () => screen.getByRole("heading", { name: "Metas do mês" })],
    ];
    for (const [aba, pagina] of paginas) {
      irPara(aba);
      await waitFor(() => expect(pagina()).not.toBeNull());
      expect(
        within(screen.getByRole("navigation", { name: "Telas" }))
          .getByRole("button", { name: aba })
          .getAttribute("aria-current"),
      ).toBe("page");
    }
  });

  it("no celular, Faturas, Tags, Outros e Perfil se alcançam por Mais", async () => {
    definirLayoutEstreito(true);
    entrarNaSimulacao();
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });

    const alvos: [string, () => HTMLElement][] = [
      ["Faturas", () => screen.getByRole("heading", { level: 2, name: "Faturas" })],
      ["Tags", () => screen.getByRole("heading", { name: "Distribuição por tags" })],
      ["Outros", () => screen.getByRole("heading", { level: 2, name: "Outros" })],
      ["Perfil", () => screen.getByRole("heading", { level: 2, name: "Perfil" })],
    ];
    for (const [nome, pagina] of alvos) {
      fireEvent.click(screen.getByRole("button", { name: "Mais" }));
      const folha = await screen.findByRole("dialog");
      fireEvent.click(within(folha).getByRole("button", { name: nome }));
      await waitFor(() => expect(pagina()).not.toBeNull());
      expect(screen.getAllByRole("main")).toHaveLength(1);
    }
    definirLayoutEstreito(false);
  });

  it("Ver orçamento, no Início, leva a Orçamento", async () => {
    entrarNaSimulacao();
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });

    fireEvent.click(await screen.findByRole("button", { name: "Ver orçamento" }));

    expect(await screen.findByRole("heading", { level: 2, name: "Metas" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Orçamento" }).getAttribute("aria-current")).toBe("page");
  });

  it("sem contas, Novo gasto em Transações leva a Contas com o formulário aberto, só daquela vez", async () => {
    entrarNaSimulacao();
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });
    irPara("Transações");
    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: "Novo gasto" }));
      expect(screen.getByRole("form", { name: "Nova conta" })).not.toBeNull();
    });
    expect(screen.getByRole("heading", { level: 2, name: "Contas" })).not.toBeNull();
    expect(await screen.findByText("Crie uma conta antes de registrar um gasto.")).not.toBeNull();

    irPara("Início");
    await screen.findByRole("heading", { name: "Metas do mês" });
    irPara("Contas");
    await screen.findByRole("heading", { level: 2, name: "Contas" });
    expect(screen.queryByRole("form", { name: "Nova conta" })).toBeNull();
  });

  it("fluxo das metas: ganho, meta de 30% para lazer, gastos e a barra mudando de situação", async () => {
    definirMidia(true);
    entrarNaSimulacao();
    const conta = await chamar<Conta>("/contas", { metodo: "POST", corpo: { nome: "Nubank" } });
    const data = new Date();
    const hoje = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
    await chamar("/ganhos", {
      metodo: "POST",
      corpo: { conta_id: conta.id, valor: "1000.00", descricao: "Salário", data: hoje, tags: [] },
    });
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });

    // Aba Orçamento: 30% da renda de R$ 1.000,00 para Lazer, ou seja, R$ 300,00.
    irPara("Orçamento");
    fireEvent.click(await screen.findByRole("button", { name: "Definir meta de Lazer" }));
    fireEvent.change(screen.getByLabelText("Ajustar o percentual de Lazer"), { target: { value: "30" } });
    expect(screen.getByText(/30% equivale a/).textContent).toContain("300,00");
    fireEvent.click(screen.getByRole("button", { name: "Salvar meta" }));
    expect(await screen.findByText("Meta salva.")).not.toBeNull();

    // Início: a meta aparece "Dentro" até o primeiro gasto, e "Estourou" depois do segundo.
    irPara("Início");
    const metas = await screen.findByRole("region", { name: "Metas do mês" });
    await waitFor(() => expect(metas.textContent).toContain("Dentro da meta"));

    async function gastarEmLazer(valor: string, descricao: string): Promise<HTMLElement> {
      irPara("Transações");
      const compositor = await abrirCompositor();
      fireEvent.change(screen.getByLabelText("Valor"), { target: { value: valor } });
      fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: descricao } });
      fireEvent.click(await within(compositor).findByLabelText("Lazer"));
      fireEvent.click(screen.getByRole("button", { name: "Registrar gasto" }));
      await screen.findByText("Gasto registrado.");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      irPara("Início");
      return screen.findByRole("region", { name: "Metas do mês" });
    }

    let regiaoDeMetas = await gastarEmLazer("25000", "Show"); // R$ 250,00 de R$ 300,00: 83%
    await waitFor(() => expect(regiaoDeMetas.textContent).toContain("Perto do limite"));

    regiaoDeMetas = await gastarEmLazer("10000", "Cinema"); // R$ 350,00 de R$ 300,00
    await waitFor(() => expect(regiaoDeMetas.textContent).toContain("Estourou em"));
    expect(within(regiaoDeMetas).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });

  it("com a sessão válida, abre direto no Início (recarregar não pede a senha)", async () => {
    entrarNaSimulacao();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Metas do mês" })).not.toBeNull();
    irPara("Perfil");
    expect(within(screen.getByRole("main")).getByText("Você")).not.toBeNull();
    expect(screen.queryByLabelText("Senha")).toBeNull();
  });

  it("fluxo completo: entra, registra um gasto, cria uma chave e sai", async () => {
    definirMidia(true);
    render(<App />);

    // Anônimo: a tela de entrar.
    expect(await screen.findByRole("form", { name: "Entrar no Gastoba" })).not.toBeNull();
    await entrarPelaTela();
    irPara("Perfil");
    expect(within(screen.getByRole("main")).getByText("Você")).not.toBeNull();

    // Contas: cria uma conta; Transações: registra um gasto.
    irPara("Contas");
    fireEvent.click(await screen.findByRole("button", { name: "Nova conta" }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Nubank" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    expect(await screen.findByText("Conta criada.")).not.toBeNull();
    expect(await screen.findByText("Nubank")).not.toBeNull();

    irPara("Transações");
    const compositor = await abrirCompositor();
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "2590" } });
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Mercado do mês" } });
    fireEvent.click(await within(compositor).findByLabelText("Conforto"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar gasto" }));
    expect(await screen.findByText("Gasto registrado.")).not.toBeNull();
    const gastos = screen.getByRole("region", { name: "Transações" });
    await waitFor(() => expect(gastos.textContent).toContain("Mercado do mês"));

    // Perfil: cria uma chave de API, vê o segredo uma vez e fecha.
    irPara("Perfil");
    expect(await screen.findByRole("heading", { level: 2, name: "Chaves de API" })).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Nome da chave"), { target: { value: "Script" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar chave" }));
    const segredo = await screen.findByRole("dialog", { name: "Chave criada" });
    const texto = segredo.querySelector("code")?.textContent ?? "";
    expect(texto).toMatch(/^gapi_/);
    fireEvent.click(within(segredo).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.innerHTML).not.toContain(texto);
    expect(await screen.findByRole("heading", { level: 3, name: "Script" })).not.toBeNull();

    // Volta a Transações: os dados continuam lá.
    irPara("Transações");
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Transações" }).textContent).toContain("Mercado do mês"),
    );

    // Sai, pelo Perfil: volta à tela de entrar, sem aviso de sessão terminada.
    irPara("Perfil");
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    expect(await screen.findByRole("form", { name: "Entrar no Gastoba" })).not.toBeNull();
    expect(screen.queryByText("Sua sessão terminou. Entre de novo.")).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    // Entrar de novo começa no Início; Transações busca os dados de novo.
    await entrarPelaTela();
    irPara("Transações");
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Transações" }).textContent).toContain("Mercado do mês"),
    );
  });

  it("a sessão que termina no meio do uso volta à tela de entrar com o aviso", async () => {
    entrarNaSimulacao();
    await chamar<Conta>("/contas", { metodo: "POST", corpo: { nome: "Nubank" } });
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });
    irPara("Transações");
    await abrirCompositor();

    // A sessão acaba no servidor; a próxima requisição recebe 401 nao_autenticado.
    await act(async () => {
      reiniciarSimulacao();
      await chamar("/contas").catch(() => undefined);
    });

    expect(await screen.findByText("Sua sessão terminou. Entre de novo.")).not.toBeNull();
    expect(screen.getByRole("form", { name: "Entrar no Gastoba" })).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    // Entrar de novo leva ao Início, sem os dados da sessão anterior.
    await entrarPelaTela();
    irPara("Contas");
    expect(await screen.findByText("Nenhuma conta ainda. Crie a primeira.")).not.toBeNull();
  });

  it("depois de sair e entrar, começa no Início mesmo se saiu do Perfil", async () => {
    entrarNaSimulacao();
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });
    irPara("Perfil");
    await screen.findByRole("heading", { level: 2, name: "Chaves de API" });

    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    await entrarPelaTela();

    expect(screen.getByRole("button", { name: "Início" }).getAttribute("aria-current")).toBe("page");
  });

  it.each([
    ["no computador", false],
    ["no celular", true],
  ])("a moldura é única em cada uma das oito telas %s", async (_nome, estreito) => {
    definirLayoutEstreito(estreito);
    entrarNaSimulacao();
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });

    const telas: [string, string][] = [
      ["Início", "Metas do mês"],
      ["Transações", "Transações"],
      ["Orçamento", "Metas"],
      ["Contas", "Contas"],
      ["Faturas", "Faturas"],
      ["Tags", "Distribuição por tags"],
      ["Outros", "Outros"],
      ["Perfil", "Perfil"],
    ];
    const principais = ["Início", "Transações", "Orçamento", "Contas"];
    for (const [tela, titulo] of telas) {
      if (estreito && !principais.includes(tela)) {
        fireEvent.click(screen.getByRole("button", { name: "Mais" }));
        const folha = await screen.findByRole("dialog");
        fireEvent.click(within(folha).getByRole("button", { name: tela }));
      } else {
        irPara(tela);
      }
      await waitFor(() => expect(screen.getByRole("heading", { name: titulo })).not.toBeNull());
      expect(screen.getAllByRole("main")).toHaveLength(1);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getAllByRole("navigation", { name: "Telas" })).toHaveLength(1);
    }
    definirLayoutEstreito(false);
  });
});
