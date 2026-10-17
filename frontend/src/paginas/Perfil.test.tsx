import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../api/cliente";
import type { ChaveDeApi, ChaveDeApiCriada } from "../api/tipos";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { entrarNaSimulacao } from "../simulacao/fetchSimulado";
import { Perfil } from "./Perfil";

// Contra o fetch simulado (vazio e sem sessão a cada teste, pelo preparar.ts;
// aqui com a sessão aberta). O relógio fica parado para as datas exibidas.
const AGORA = new Date(2026, 9, 12, 14, 30); // 12/10/2026 14:30 em Brasília

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  entrarNaSimulacao();
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "clipboard");
});

/** Troca a área de transferência do navegador (o jsdom não tem uma). */
function definirAreaDeTransferencia(valor: unknown): void {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: valor });
}

function navegacao(): Navegacao {
  return { nomeDaPessoa: "Você", tela: "perfil", aoIrPara: vi.fn(), aoSair: vi.fn() };
}

function renderizar(nav: Navegacao = navegacao()) {
  return render(<Perfil navegacao={nav} />);
}

async function criarPelaApi(nome: string, escopo: "leitura" | "escrita" = "leitura") {
  return chamar<ChaveDeApiCriada>("/chaves-de-api", { metodo: "POST", corpo: { nome, escopo } });
}

function dialogo(): HTMLDialogElement | null {
  return document.querySelector("dialog");
}

/** Preenche o formulário e cria a chave; devolve o diálogo do segredo. */
async function criarPelaTela(nome: string, escopo: "Leitura" | "Escrita" = "Leitura") {
  fireEvent.change(screen.getByLabelText("Nome da chave"), { target: { value: nome } });
  fireEvent.click(screen.getByRole("radio", { name: escopo }));
  fireEvent.click(screen.getByRole("button", { name: "Criar chave" }));
  await waitFor(() => expect(dialogo()?.open).toBe(true));
  return dialogo() as HTMLDialogElement;
}

function segredoNaTela(): string {
  const codigo = dialogo()?.querySelector("code");
  if (!codigo) throw new Error("Segredo ausente.");
  return codigo.textContent ?? "";
}

describe("Perfil", () => {
  it("mostra o título, a moldura com um só h1 e o estado vazio", async () => {
    renderizar();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Gastoba");
    expect(screen.getByRole("heading", { level: 2, name: "Chaves de API" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Perfil" }).getAttribute("aria-current")).toBe("page");
    expect(await screen.findByText("Nenhuma chave ainda.")).not.toBeNull();
  });

  it("sem chaves, o estado vazio explica para que serve a chave", async () => {
    renderizar();

    const titulo = await screen.findByText("Nenhuma chave ainda.");
    expect(titulo.parentElement?.textContent).toContain("Crie uma chave");
    expect(screen.queryByRole("list", { name: "Chaves de API ativas" })).toBeNull();
  });

  it("o cartão da pessoa traz o nome e o botão Sair", () => {
    const nav = navegacao();
    renderizar(nav);

    const cartao = screen.getByRole("group", { name: "Sua conta" });
    expect(cartao.textContent).toContain("Você");
    fireEvent.click(within(cartao).getByRole("button", { name: "Sair" }));
    expect(nav.aoSair).toHaveBeenCalledTimes(1);
  });

  it("chave expirada continua na lista com o texto Expirada", async () => {
    await chamar<ChaveDeApiCriada>("/chaves-de-api", {
      metodo: "POST",
      corpo: {
        nome: "Antiga",
        escopo: "leitura",
        expira_em: new Date(2026, 9, 12, 15, 30).toISOString(),
      },
    });
    await criarPelaApi("Vigente");
    vi.setSystemTime(new Date(2026, 9, 12, 17, 0));
    renderizar();

    const lista = await screen.findByRole("list", { name: "Chaves de API ativas" });
    const itens = await within(lista).findAllByRole("listitem");
    const antiga = itens.find((item) => item.textContent?.includes("Antiga"));
    const vigente = itens.find((item) => item.textContent?.includes("Vigente"));
    expect(within(antiga as HTMLElement).getByText("Expirada")).not.toBeNull();
    expect(within(vigente as HTMLElement).queryByText("Expirada")).toBeNull();
  });

  it("mostra o nome da pessoa e Sair chama aoSair", () => {
    const nav = navegacao();
    renderizar(nav);

    expect(screen.getByRole("heading", { level: 2, name: "Perfil" })).not.toBeNull();
    expect(within(screen.getByRole("main")).getByText("Você")).not.toBeNull();
    fireEvent.click(within(screen.getByRole("main")).getByRole("button", { name: "Sair" }));
    expect(nav.aoSair).toHaveBeenCalledTimes(1);
  });

  it("Início na navegação volta ao início", () => {
    const nav = navegacao();
    renderizar(nav);

    fireEvent.click(screen.getByRole("button", { name: "Início" }));

    expect(nav.aoIrPara).toHaveBeenCalledWith("inicio");
  });

  it("lista as chaves com nome, prefixo, escopo e datas no fuso local", async () => {
    const criada = await criarPelaApi("Planilha", "escrita");
    renderizar();

    const item = await within(await screen.findByRole("list", { name: "Chaves de API ativas" }))
      .findByRole("listitem");
    expect(within(item).getByRole("heading", { name: "Planilha" })).not.toBeNull();
    expect(item.textContent).toContain(criada.prefixo);
    expect(item.textContent).toContain("Escrita");
    expect(item.textContent).toContain("Criada em12/10/2026, 14:30");
    expect(item.textContent).toContain("Último usoNunca");
    expect(item.textContent).toContain("Expira emNão expira");
    expect(item.querySelector("time")?.getAttribute("datetime")).toBe(criada.criada_em);
    // A listagem nunca traz o segredo.
    expect(document.body.innerHTML).not.toContain(criada.segredo);
  });

  it("explica cada escopo junto à opção", () => {
    renderizar();

    const leitura = screen.getByRole("radio", { name: "Leitura" });
    const escrita = screen.getByRole("radio", { name: "Escrita" });
    const explicacao = (campo: HTMLElement) =>
      document.getElementById(campo.getAttribute("aria-describedby") ?? "")?.textContent ?? "";

    expect(explicacao(leitura)).toContain("Só consulta");
    expect(explicacao(escrita)).toContain("registra gastos");
    expect((leitura as HTMLInputElement).checked).toBe(true);
  });

  it("não oferece expiração na criação", () => {
    renderizar();

    expect(screen.queryByLabelText(/expira/i)).toBeNull();
  });

  it("criar mostra o segredo uma vez num diálogo e a chave entra na lista", async () => {
    renderizar();
    await screen.findByText("Nenhuma chave ainda.");

    const caixa = await criarPelaTela("Script de backup", "Escrita");

    expect(within(caixa).getByRole("heading", { name: "Chave criada" })).not.toBeNull();
    expect(caixa.textContent).toContain("não será mostrado de novo");
    expect(segredoNaTela()).toMatch(/^gapi_/);
    const item = await within(
      await screen.findByRole("list", { name: "Chaves de API ativas" }),
    ).findByRole("listitem");
    expect(within(item).getByRole("heading", { name: "Script de backup" })).not.toBeNull();
    expect(item.textContent).toContain("Escrita");
    // O formulário volta ao começo.
    expect((screen.getByLabelText("Nome da chave") as HTMLInputElement).value).toBe("");
  });

  it("Fechar descarta o segredo e não o guarda em lugar algum", async () => {
    renderizar();
    await criarPelaTela("Script");
    const segredo = segredoNaTela();

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    await waitFor(() => expect(dialogo()).toBeNull());
    expect(document.body.innerHTML).not.toContain(segredo);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(window.location.href).not.toContain(segredo);
  });

  it("Esc fecha o diálogo e descarta o segredo", async () => {
    renderizar();
    const caixa = await criarPelaTela("Script");
    const segredo = segredoNaTela();

    fireEvent.keyDown(caixa, { key: "Escape" });

    await waitFor(() => expect(dialogo()).toBeNull());
    expect(document.body.innerHTML).not.toContain(segredo);
  });

  it("o evento cancel do diálogo também fecha de forma controlada", async () => {
    renderizar();
    const caixa = await criarPelaTela("Script");

    const cancelar = new Event("cancel", { cancelable: true });
    fireEvent(caixa, cancelar);

    expect(cancelar.defaultPrevented).toBe(true);
    await waitFor(() => expect(dialogo()).toBeNull());
  });

  it("Copiar põe o segredo na área de transferência e confirma", async () => {
    const escrever = vi.fn(async () => undefined);
    definirAreaDeTransferencia({ writeText: escrever });
    renderizar();
    await criarPelaTela("Script");
    const segredo = segredoNaTela();

    fireEvent.click(screen.getByRole("button", { name: "Copiar" }));

    expect(await screen.findByText("Segredo copiado.")).not.toBeNull();
    expect(escrever).toHaveBeenCalledWith(segredo);
  });

  it("se a cópia falhar, pede para copiar à mão", async () => {
    definirAreaDeTransferencia({ writeText: () => Promise.reject(new Error("negado")) });
    renderizar();
    await criarPelaTela("Script");

    fireEvent.click(screen.getByRole("button", { name: "Copiar" }));

    expect(
      await screen.findByText("Não foi possível copiar. Selecione o segredo e copie à mão."),
    ).not.toBeNull();
  });

  it("sem área de transferência, não há Copiar e a tela avisa", async () => {
    definirAreaDeTransferencia(undefined);
    renderizar();
    await criarPelaTela("Script");

    expect(screen.queryByRole("button", { name: "Copiar" })).toBeNull();
    expect(
      screen.getByText(
        "A área de transferência não está disponível aqui: selecione o segredo e copie à mão.",
      ),
    ).not.toBeNull();
  });

  it("nome vazio: a mensagem da API aparece junto ao campo", async () => {
    renderizar();

    fireEvent.change(screen.getByLabelText("Nome da chave"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Criar chave" }));

    const mensagem = await screen.findByText("O nome da chave de API não pode ser vazio.");
    const campo = screen.getByLabelText("Nome da chave");
    expect(campo.getAttribute("aria-invalid")).toBe("true");
    expect(campo.getAttribute("aria-describedby")).toContain(mensagem.id);
    // O foco chega ao campo depois da resposta: espera o sinal estável em vez de assumir o instante.
    await waitFor(() => expect(document.activeElement).toBe(campo));
    expect(dialogo()).toBeNull();
  });

  it("revogar pede confirmação; Cancelar mantém a chave", async () => {
    await criarPelaApi("Planilha");
    renderizar();
    const item = await within(await screen.findByRole("list", { name: "Chaves de API ativas" }))
      .findByRole("listitem");

    fireEvent.click(within(item).getByRole("button", { name: "Revogar a chave Planilha" }));

    expect(item.textContent).toContain("Revogar a chave Planilha?");
    expect(document.activeElement).toBe(within(item).getByRole("button", { name: "Cancelar" }));
    fireEvent.click(within(item).getByRole("button", { name: "Cancelar" }));

    expect(within(item).queryByRole("button", { name: "Confirmar revogação" })).toBeNull();
    expect(document.activeElement).toBe(
      within(item).getByRole("button", { name: "Revogar a chave Planilha" }),
    );
    const chaves = await chamar<ChaveDeApi[]>("/chaves-de-api");
    expect(chaves).toHaveLength(1);
  });

  it("confirmar a revogação tira a chave da lista e avisa", async () => {
    await criarPelaApi("Planilha");
    renderizar();
    const item = await within(await screen.findByRole("list", { name: "Chaves de API ativas" }))
      .findByRole("listitem");

    fireEvent.click(within(item).getByRole("button", { name: "Revogar a chave Planilha" }));
    fireEvent.click(within(item).getByRole("button", { name: "Confirmar revogação" }));

    expect(await screen.findByText("Chave revogada.")).not.toBeNull();
    expect(await screen.findByText("Nenhuma chave ainda.")).not.toBeNull();
  });

  it("revogar uma chave já revogada mostra a mensagem da API e recarrega a lista", async () => {
    const criada = await criarPelaApi("Planilha");
    renderizar();
    const item = await within(await screen.findByRole("list", { name: "Chaves de API ativas" }))
      .findByRole("listitem");
    fireEvent.click(within(item).getByRole("button", { name: "Revogar a chave Planilha" }));

    await act(async () => {
      await chamar(`/chaves-de-api/${criada.id}`, { metodo: "DELETE" });
    });
    fireEvent.click(within(item).getByRole("button", { name: "Confirmar revogação" }));

    expect(await screen.findByText("Chave de API não encontrada.")).not.toBeNull();
    expect(await screen.findByText("Nenhuma chave ainda.")).not.toBeNull();
  });

  it("sem resposta do servidor ao listar: avisa", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    renderizar();

    expect(
      await screen.findByText("Não foi possível falar com o servidor. Confira se a API está rodando."),
    ).not.toBeNull();
  });
});
