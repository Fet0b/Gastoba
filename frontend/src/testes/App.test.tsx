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

async function irPara(aba: string): Promise<void> {
  await act(async () => {
    const navegacao = screen.getByRole("navigation", { name: "Telas" });
    fireEvent.click(within(navegacao).getByRole("link", { name: aba }));
  });
  expect(screen.getByRole("link", { name: aba }).getAttribute("aria-current")).toBe("page");
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
    await irPara("Perfil");
    expect(await within(await screen.findByRole("main")).findByText("Ana")).not.toBeNull();
  });

  it("entra em Início e cada aba abre a página certa", async () => {
    entrarNaSimulacao();
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });
    expect(screen.getByRole("link", { name: "Início" }).getAttribute("aria-current")).toBe("page");

    const paginas: [string, () => HTMLElement][] = [
      ["Transações", () => screen.getByRole("heading", { level: 2, name: "Transações" })],
      ["Orçamento", () => screen.getByRole("heading", { level: 2, name: "Orçamento" })],
      ["Contas", () => screen.getByRole("heading", { level: 2, name: "Contas" })],
      ["Caixinhas", () => screen.getByRole("heading", { level: 2, name: "Caixinhas" })],
      ["Faturas", () => screen.getByRole("heading", { level: 2, name: "Faturas" })],
      ["Tags", () => screen.getByRole("heading", { name: "Distribuição por tags" })],
      ["Recorrências", () => screen.getByRole("heading", { level: 2, name: "Recorrências" })],
      ["Perfil", () => screen.getByRole("heading", { level: 2, name: "Perfil" })],
      ["Início", () => screen.getByRole("heading", { name: "Metas do mês" })],
    ];
    for (const [aba, pagina] of paginas) {
      await irPara(aba);
      await waitFor(() => expect(pagina()).not.toBeNull());
      expect(
        within(screen.getByRole("navigation", { name: "Telas" }))
          .getByRole("link", { name: aba })
          .getAttribute("aria-current"),
      ).toBe("page");
    }
  });

  it("no celular, Caixinhas, Faturas, Tags, Recorrências e Perfil se alcançam por Mais", async () => {
    definirLayoutEstreito(true);
    entrarNaSimulacao();
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });

    const alvos: [string, () => HTMLElement][] = [
      ["Caixinhas", () => screen.getByRole("heading", { level: 2, name: "Caixinhas" })],
      ["Faturas", () => screen.getByRole("heading", { level: 2, name: "Faturas" })],
      ["Tags", () => screen.getByRole("heading", { name: "Distribuição por tags" })],
      ["Recorrências", () => screen.getByRole("heading", { level: 2, name: "Recorrências" })],
      ["Perfil", () => screen.getByRole("heading", { level: 2, name: "Perfil" })],
    ];
    for (const [nome, pagina] of alvos) {
      fireEvent.click(screen.getByRole("button", { name: "Mais" }));
      const folha = await screen.findByRole("dialog");
      fireEvent.click(within(folha).getByRole("link", { name: nome }));
      await waitFor(() => expect(pagina()).not.toBeNull());
      expect(screen.getAllByRole("main")).toHaveLength(1);
    }
    definirLayoutEstreito(false);
  });

  it("link direto: abrir /caixinhas mostra a tela Caixinhas, sem mês na URL", async () => {
    window.history.replaceState(null, "", "/caixinhas");
    entrarNaSimulacao();
    render(<App />);
    expect(await screen.findByRole("heading", { level: 2, name: "Caixinhas" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Caixinhas" }).getAttribute("aria-current")).toBe("page");
    expect(window.location.pathname + window.location.search).toBe("/caixinhas");
  });

  it("a rota vem do endereço: abrir /orcamento?mes=2026-10 mostra outubro no Orçamento", async () => {
    window.history.replaceState(null, "", "/orcamento?mes=2026-10");
    entrarNaSimulacao();
    render(<App />);
    expect(await screen.findByRole("heading", { level: 2, name: "Orçamento" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Orçamento" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("group", { name: "Período" }).textContent).toContain("outubro de 2026");
  });

  it("trocar de mês muda o ?mes=, o mês acompanha a ida a outra tela mensal e o voltar desfaz", async () => {
    window.history.replaceState(null, "", "/orcamento?mes=2026-10");
    entrarNaSimulacao();
    render(<App />);
    await screen.findByRole("heading", { level: 2, name: "Orçamento" });

    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(window.location.search).toBe("?mes=2026-09");

    await irPara("Tags");
    expect(window.location.pathname + window.location.search).toBe("/tags?mes=2026-09");
    expect(await screen.findByRole("heading", { name: "Distribuição por tags" })).not.toBeNull();
    expect(screen.getByRole("group", { name: "Período" }).textContent).toContain("setembro de 2026");

    act(() => window.history.back());
    expect(await screen.findByRole("heading", { level: 2, name: "Orçamento" })).not.toBeNull();
    expect(window.location.pathname).toBe("/orcamento");
  });

  it("um endereço desconhecido cai no Início", async () => {
    window.history.replaceState(null, "", "/nada-aqui");
    entrarNaSimulacao();
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });
    await waitFor(() => expect(window.location.pathname).toBe("/inicio"));
  });

  it("Ver orçamento, no Início, leva a Orçamento", async () => {
    entrarNaSimulacao();
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });

    fireEvent.click(await screen.findByRole("button", { name: "Ver orçamento" }));

    expect(await screen.findByRole("heading", { level: 2, name: "Orçamento" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Orçamento" }).getAttribute("aria-current")).toBe("page");
  });

  it("Novo gasto e N valem em qualquer tela: abrem o compositor em Transações", async () => {
    entrarNaSimulacao();
    await chamar("/contas", { metodo: "POST", corpo: { nome: "Carteira", saldo_inicial: "10.00" } });
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });

    fireEvent.keyDown(window, { key: "n" });

    expect(await screen.findByRole("heading", { level: 2, name: "Transações" })).not.toBeNull();
    expect(await screen.findByRole("dialog", { name: "Novo gasto" })).not.toBeNull();
  });

  it("de Faturas, o botão Novo gasto também leva ao compositor, e trocar de tela o limpa", async () => {
    entrarNaSimulacao();
    await chamar("/contas", { metodo: "POST", corpo: { nome: "Carteira", saldo_inicial: "10.00" } });
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });
    await irPara("Faturas");
    await screen.findByRole("heading", { level: 2, name: "Faturas" });

    fireEvent.click(screen.getByRole("button", { name: "Novo gasto" }));
    const dialogo = await screen.findByRole("dialog", { name: "Novo gasto" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await irPara("Início");
    await screen.findByRole("heading", { name: "Metas do mês" });
    await irPara("Transações");
    await screen.findByRole("heading", { level: 2, name: "Transações" });
    expect(screen.queryByRole("dialog", { name: "Novo gasto" })).toBeNull();
  });

  it("sem contas, Novo gasto em Transações leva a Contas com o formulário aberto, só daquela vez", async () => {
    entrarNaSimulacao();
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });
    await irPara("Transações");
    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: "Novo gasto" }));
      expect(screen.getByRole("form", { name: "Nova conta" })).not.toBeNull();
    });
    expect(screen.getByRole("heading", { level: 2, name: "Contas" })).not.toBeNull();
    expect(await screen.findByText("Crie uma conta antes de registrar um gasto.")).not.toBeNull();

    await irPara("Início");
    await screen.findByRole("heading", { name: "Metas do mês" });
    await irPara("Contas");
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
    await irPara("Orçamento");
    fireEvent.click(await screen.findByRole("button", { name: "Editar metas" }));
    fireEvent.change(await screen.findByLabelText("Ajustar o percentual de Lazer"), { target: { value: "30" } });
    expect(screen.getByText(/30% equivale a/).textContent).toContain("300,00");
    fireEvent.click(screen.getByRole("button", { name: "Salvar meta" }));
    expect(await screen.findByText("Meta salva.")).not.toBeNull();

    // Início: a meta aparece dentro do limite (Restam R$ 300,00) até o primeiro gasto e "Estourou"
    // depois do segundo; a situação fica em data-situacao na linha compacta.
    await irPara("Início");
    const metas = await screen.findByRole("region", { name: "Metas do mês" });
    await waitFor(() => expect(metas.textContent).toMatch(/Restam R\$.300,00/));
    expect(metas.querySelector("[data-linha-da-meta]")?.getAttribute("data-situacao")).toBe("dentro");

    async function gastarEmLazer(valor: string, descricao: string): Promise<HTMLElement> {
      await irPara("Transações");
      const compositor = await abrirCompositor();
      fireEvent.change(screen.getByLabelText("Valor"), { target: { value: valor } });
      fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: descricao } });
      fireEvent.click(await within(compositor).findByLabelText("Lazer"));
      fireEvent.click(screen.getByRole("button", { name: "Registrar gasto" }));
      await screen.findByText("Gasto registrado.");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await irPara("Início");
      return screen.findByRole("region", { name: "Metas do mês" });
    }

    let regiaoDeMetas = await gastarEmLazer("25000", "Show"); // R$ 250,00 de R$ 300,00: 83%
    await waitFor(() =>
      expect(regiaoDeMetas.querySelector("[data-linha-da-meta]")?.getAttribute("data-situacao")).toBe("alerta"),
    );
    expect(regiaoDeMetas.textContent).toMatch(/Restam R\$.50,00/);

    regiaoDeMetas = await gastarEmLazer("10000", "Cinema"); // R$ 350,00 de R$ 300,00
    await waitFor(() => expect(regiaoDeMetas.textContent).toMatch(/Passou R\$\s50,00/));
    const anel = within(regiaoDeMetas).getByRole("img", { name: /^Lazer: / });
    expect(anel.getAttribute("aria-label")).toContain("116% usado");
    expect(anel.querySelector("[data-arco]")?.getAttribute("stroke-dasharray")).toBe("100 100");
  });

  it("com a sessão válida, abre direto no Início (recarregar não pede a senha)", async () => {
    entrarNaSimulacao();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Metas do mês" })).not.toBeNull();
    await irPara("Perfil");
    expect(within(screen.getByRole("main")).getByText("Você")).not.toBeNull();
    expect(screen.queryByLabelText("Senha")).toBeNull();
  });

  it("fluxo completo: entra, registra um gasto, cria uma chave e sai", async () => {
    definirMidia(true);
    render(<App />);

    // Anônimo: a tela de entrar.
    expect(await screen.findByRole("form", { name: "Entrar no Gastoba" })).not.toBeNull();
    await entrarPelaTela();
    await irPara("Perfil");
    expect(within(screen.getByRole("main")).getByText("Você")).not.toBeNull();

    // Contas: cria uma conta; Transações: registra um gasto.
    await irPara("Contas");
    fireEvent.click(await screen.findByRole("button", { name: "Nova conta" }));
    fireEvent.change(await screen.findByLabelText("Nome"), { target: { value: "Nubank" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    expect(await screen.findByText("Conta criada.")).not.toBeNull();
    expect(await screen.findByText("Nubank")).not.toBeNull();

    await irPara("Transações");
    const compositor = await abrirCompositor();
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "2590" } });
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Mercado do mês" } });
    fireEvent.click(await within(compositor).findByLabelText("Conforto"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar gasto" }));
    expect(await screen.findByText("Gasto registrado.")).not.toBeNull();
    const gastos = screen.getByRole("region", { name: "Transações" });
    await waitFor(() => expect(gastos.textContent).toContain("Mercado do mês"));

    // Perfil: cria uma chave de API, vê o segredo uma vez e fecha.
    await irPara("Perfil");
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
    await irPara("Transações");
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Transações" }).textContent).toContain("Mercado do mês"),
    );

    // Sai, pelo Perfil: volta à tela de entrar, sem aviso de sessão terminada.
    await irPara("Perfil");
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    expect(await screen.findByRole("form", { name: "Entrar no Gastoba" })).not.toBeNull();
    expect(screen.queryByText("Sua sessão terminou. Entre de novo.")).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    // Entrar de novo começa no Início; Transações busca os dados de novo.
    await entrarPelaTela();
    await irPara("Transações");
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Transações" }).textContent).toContain("Mercado do mês"),
    );
  });

  it("a sessão que termina no meio do uso volta à tela de entrar com o aviso", async () => {
    entrarNaSimulacao();
    await chamar<Conta>("/contas", { metodo: "POST", corpo: { nome: "Nubank" } });
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });
    await irPara("Transações");
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
    await irPara("Contas");
    expect(await screen.findByText("Nenhuma conta ainda")).not.toBeNull();
  });

  it("depois de sair e entrar, começa no Início mesmo se saiu do Perfil", async () => {
    entrarNaSimulacao();
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });
    await irPara("Perfil");
    await screen.findByRole("heading", { level: 2, name: "Chaves de API" });

    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    await entrarPelaTela();

    expect(screen.getByRole("link", { name: "Início" }).getAttribute("aria-current")).toBe("page");
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
      ["Orçamento", "Orçamento"],
      ["Contas", "Contas"],
      ["Faturas", "Faturas"],
      ["Tags", "Distribuição por tags"],
      ["Recorrências", "Recorrências"],
      ["Perfil", "Perfil"],
    ];
    const principais = ["Início", "Transações", "Orçamento", "Contas"];
    for (const [tela, titulo] of telas) {
      if (estreito && !principais.includes(tela)) {
        fireEvent.click(screen.getByRole("button", { name: "Mais" }));
        const folha = await screen.findByRole("dialog");
        fireEvent.click(within(folha).getByRole("link", { name: tela }));
      } else {
        await irPara(tela);
      }
      await waitFor(() => expect(screen.getByRole("heading", { name: titulo })).not.toBeNull());
      expect(screen.getAllByRole("main")).toHaveLength(1);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getAllByRole("navigation", { name: "Telas" })).toHaveLength(1);
    }
    definirLayoutEstreito(false);
  });
});

it("Investimentos abre Transações em aportes e trocar de aba limpa o pedido", async () => {
  entrarNaSimulacao(); render(<App />);
  await screen.findByRole("heading", { name: "Metas do mês" });
  await irPara("Investimentos");
  fireEvent.click(await screen.findByRole("button", { name: "Ver aportes e resgates em Transações" }));
  expect(await screen.findByRole("region", { name: "Movimentos de investimento" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Aportes e resgates" }).getAttribute("aria-pressed")).toBe("true");
  await irPara("Contas"); await irPara("Transações");
  expect(screen.getByRole("button", { name: "Gastos e ganhos" }).getAttribute("aria-pressed")).toBe("true");
});

describe("aparência da pessoa", () => {
  it("aplica a aparência salva ao receber o perfil e a limpa ao sair", async () => {
    entrarNaSimulacao();
    await chamar("/aparencia", {
      metodo: "PUT",
      corpo: { matiz: 12, intensidade: "viva", textura: "grade", nome: "Meu cofre", marca: "cofre" },
    });
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });
    expect(document.documentElement.style.getPropertyValue("--cor-ametista")).toMatch(/^#/);
    expect(document.documentElement.style.getPropertyValue("--textura-da-pagina")).toContain("gradient");
    expect(document.title).toBe("Meu cofre");

    await irPara("Perfil");
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    await screen.findByRole("form", { name: "Entrar no Gastoba" });
    expect(document.documentElement.style.cssText).toBe("");
    expect(document.title).not.toBe("Meu cofre");
  });

  it("sem aparência salva, não troca nenhum token", async () => {
    entrarNaSimulacao();
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });
    expect(document.documentElement.style.cssText).toBe("");
  });

  it("perder a sessão no meio do uso também limpa a aparência", async () => {
    entrarNaSimulacao();
    await chamar("/aparencia", {
      metodo: "PUT",
      corpo: { matiz: 12, intensidade: "viva", textura: "nenhuma", nome: "Meu cofre", marca: "cofre" },
    });
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });
    reiniciarSimulacao();
    await act(async () => {
      await chamar("/contas").catch(() => undefined);
    });
    await screen.findByRole("form", { name: "Entrar no Gastoba" });
    expect(document.documentElement.style.cssText).toBe("");
  });

  it("salvar pelo Perfil muda o nome e a logo da barra lateral e a cor na hora", async () => {
    entrarNaSimulacao();
    render(<App />);
    await screen.findByRole("heading", { name: "Metas do mês" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Gastoba");
    await irPara("Perfil");
    const formulario = await screen.findByRole("form", { name: "Aparência do app" });
    // Ordem do Perfil: a pessoa, a Aparência e depois as chaves de API.
    const principal = screen.getByRole("main");
    const textos = principal.textContent ?? "";
    expect(textos.indexOf("Conectado como")).toBeLessThan(textos.indexOf("Aparência"));
    expect(textos.indexOf("Aparência")).toBeLessThan(textos.indexOf("Chaves de API"));

    fireEvent.click(within(formulario).getByRole("radio", { name: "Verde" }));
    fireEvent.click(within(formulario).getByRole("radio", { name: "Cofre" }));
    fireEvent.change(within(formulario).getByLabelText("Nome do app"), { target: { value: "Meu cofre" } });
    await act(async () => {
      fireEvent.click(within(formulario).getByRole("button", { name: "Salvar aparência" }));
    });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Meu cofre"));
    expect(document.querySelector("[data-marca='cofre']")).not.toBeNull();
    expect(document.title).toBe("Meu cofre");

    // Restaurar volta ao padrão em toda parte.
    fireEvent.click(screen.getByRole("button", { name: "Mais ações da aparência" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Restaurar a aparência padrão" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restaurar" }));
    });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Gastoba"));
    expect(document.documentElement.style.cssText).toBe("");
  });
});
