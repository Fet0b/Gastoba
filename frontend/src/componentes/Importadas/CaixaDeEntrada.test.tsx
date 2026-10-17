import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { chamar } from "../../api/cliente";
import type { Conta, Ganho, Gasto, Sincronizacao, TransacaoImportada } from "../../api/tipos";
import { definirMidia } from "../../testes/preparar";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { Aviso, type MensagemDoAviso } from "../Aviso/Aviso";
import { CaixaDeEntrada, textoDaSincronizacao } from "./CaixaDeEntrada";

// Contra o fetch simulado (vazio e sem sessão a cada teste, pelo preparar.ts; aqui com a sessão
// da pessoa de exemplo, que é a dona da importação).
beforeEach(() => {
  entrarNaSimulacao();
});

const NBSP = "\u{a0}";
const MENOS = "\u{2212}";
const PERIODO_LARGO = { inicio: "2000-01-01", fim: "2999-12-31" };

async function sincronizarNoServidor(): Promise<void> {
  await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
}

function cartao(descricao: string): HTMLElement {
  return screen.getByRole("listitem", { name: descricao });
}

/** A página dona em miniatura: guarda a mensagem e mostra o aviso. */
function ComAviso() {
  const [mensagem, definirMensagem] = useState<MensagemDoAviso | null>(null);
  return (
    <>
      <CaixaDeEntrada
        aoAvisar={(tipo, texto) => definirMensagem({ tipo, texto })}
        aoSinalizarOlho={() => {}}
      />
      <Aviso mensagem={mensagem} aoDispensar={() => definirMensagem(null)} />
    </>
  );
}

async function abrir(): Promise<void> {
  render(<ComAviso />);
  await screen.findByRole("button", { name: "Sincronizar agora" });
}

describe("CaixaDeEntrada", () => {
  it("com a caixa vazia, explica e oferece a sincronização", async () => {
    await abrir();

    expect(await screen.findByText("Nada esperando você")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sincronizar agora" })).toBeTruthy();
  });

  it("Sincronizar agora enche a caixa e avisa quantas são novas", async () => {
    await abrir();

    fireEvent.click(screen.getByRole("button", { name: "Sincronizar agora" }));

    expect(await screen.findByText("4 transações novas na caixa.")).toBeTruthy();
    expect(await screen.findByRole("listitem", { name: "Mercado Extra" })).toBeTruthy();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(4);
    fireEvent.click(screen.getByRole("button", { name: "Sincronizar agora" }));
    expect(await screen.findByText("Nenhuma transação nova.")).toBeTruthy();
  });

  it("mostra a saída com sinal de menos e a entrada com sinal de mais, e a conta do banco", async () => {
    await sincronizarNoServidor();
    await abrir();

    const mercado = await screen.findByRole("listitem", { name: "Mercado Extra" });
    expect(mercado.textContent).toContain(`${MENOS}R$${NBSP}87,35`);
    expect(mercado.textContent).toContain("Conta Corrente");
    expect(mercado.textContent).toContain("Saída");
    expect(cartao("Salário").textContent).toContain(`+R$${NBSP}5.000,00`);
  });

  it("avisa em texto o que provavelmente se ignora", async () => {
    await sincronizarNoServidor();
    await abrir();

    expect((await screen.findByRole("listitem", { name: "Estorno de compra" })).textContent).toContain(
      "Provavelmente ignorar",
    );
    expect(cartao("Salário").textContent).not.toContain("Provavelmente ignorar");
  });

  it("aceitar uma saída pede a categoria e cria o gasto sem mexer no saldo", async () => {
    await sincronizarNoServidor();
    await abrir();
    const item = await screen.findByRole("listitem", { name: "Farmácia" });
    const aceitar = within(item).getByRole("button", { name: /Aceitar como gasto/ }) as HTMLButtonElement;

    expect(aceitar.disabled).toBe(true);
    expect(within(item).getByText("Escolha a categoria para aceitar como gasto.")).toBeTruthy();
    fireEvent.click(await within(item).findByLabelText("Conforto"));
    expect(aceitar.disabled).toBe(false);
    fireEvent.click(aceitar);

    expect(await screen.findByText("Gasto criado.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("listitem", { name: "Farmácia" })).toBeNull());
    const gastos = await chamar<Gasto[]>("/gastos", { parametros: PERIODO_LARGO });
    expect(gastos.map((g) => [g.descricao, g.categoria, g.origem])).toEqual([
      ["Farmácia", "conforto", "open_finance"],
    ]);
    const [conta] = await chamar<Conta[]>("/contas");
    expect(conta.saldo).toBe("1500.00");
  });

  it("aceitar uma entrada não pede categoria e cria o ganho", async () => {
    await sincronizarNoServidor();
    await abrir();
    const item = await screen.findByRole("listitem", { name: "Salário" });

    expect(within(item).queryByLabelText("Conforto")).toBeNull();
    fireEvent.click(within(item).getByRole("button", { name: /Aceitar como ganho/ }));

    expect(await screen.findByText("Ganho criado.")).toBeTruthy();
    const ganhos = await chamar<Ganho[]>("/ganhos", { parametros: PERIODO_LARGO });
    expect(ganhos.map((g) => [g.descricao, g.valor, g.origem])).toEqual([
      ["Salário", "5000.00", "open_finance"],
    ]);
  });

  it("as tags escolhidas vão junto, normalizadas", async () => {
    await sincronizarNoServidor();
    await abrir();
    const item = await screen.findByRole("listitem", { name: "Farmácia" });
    fireEvent.click(await within(item).findByLabelText("Conforto"));
    fireEvent.click(within(item).getByRole("button", { name: "Adicionar tags" }));
    const campo = within(item).getByLabelText("Tags");
    fireEvent.change(campo, { target: { value: "Saúde" } });
    fireEvent.keyDown(campo, { key: "Enter" });

    fireEvent.click(within(item).getByRole("button", { name: /Aceitar como gasto/ }));

    await screen.findByText("Gasto criado.");
    const [gasto] = await chamar<Gasto[]>("/gastos", { parametros: PERIODO_LARGO });
    expect(gasto.tags).toEqual(["saúde"]);
  });

  it("tag digitada e não confirmada bloqueia o aceite", async () => {
    await sincronizarNoServidor();
    await abrir();
    const item = await screen.findByRole("listitem", { name: "Salário" });

    fireEvent.click(within(item).getByRole("button", { name: "Adicionar tags" }));
    fireEvent.change(within(item).getByLabelText("Tags"), { target: { value: "pix" } });

    expect((within(item).getByRole("button", { name: /Aceitar como ganho/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("ignorar tira da caixa sem criar gasto nem ganho", async () => {
    await sincronizarNoServidor();
    await abrir();
    const item = await screen.findByRole("listitem", { name: "Estorno de compra" });

    fireEvent.click(within(item).getByRole("button", { name: "Ignorar: Estorno de compra" }));

    expect(await screen.findByText("Transação ignorada.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("listitem", { name: "Estorno de compra" })).toBeNull());
    expect(await chamar<Ganho[]>("/ganhos", { parametros: PERIODO_LARGO })).toEqual([]);
  });

  it("sinaliza o possível duplicado de um lançamento manual", async () => {
    await sincronizarNoServidor();
    const [conta] = await chamar<Conta[]>("/contas");
    const importadas = await chamar<TransacaoImportada[]>("/transacoes-importadas");
    const mercado = importadas.find((t) => t.descricao === "Mercado Extra") as TransacaoImportada;
    await chamar("/gastos", {
      metodo: "POST",
      corpo: {
        conta_id: conta.id,
        valor: "87.35",
        descricao: "Pix mercado",
        data: mercado.data,
        categoria: "conforto",
        tags: [],
      },
    });
    await abrir();

    expect((await screen.findByRole("listitem", { name: "Mercado Extra" })).textContent).toContain(
      "Possível duplicado",
    );
    expect(cartao("Farmácia").textContent).not.toContain("Possível duplicado");
  });
});

describe("CaixaDeEntrada como fila", () => {
  /** Só os cartões da fila (os avisos de motivo também são `li`). */
  function cartoes(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>("li[data-transacao]"));
  }

  async function esperarCartoes(): Promise<void> {
    await waitFor(() => expect(cartoes().length).toBeGreaterThan(0));
  }

  function tituloDoCartao(item: HTMLElement): string {
    return within(item).getByRole("heading", { level: 3 }).textContent ?? "";
  }

  it("o cabeçalho conta quantas esperam e a contagem desce ao tratar", async () => {
    await sincronizarNoServidor();
    await abrir();
    await esperarCartoes();
    const total = cartoes().length;
    const contagem = screen.getByTestId("contagem-da-fila");

    expect(contagem.textContent).toBe(`${total} esperando`);
    expect(screen.getByRole("heading", { level: 2, name: "Caixa de entrada" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Ignorar: Estorno de compra" }));
    await screen.findByText("Transação ignorada.");

    await waitFor(() => expect(contagem.textContent).toBe(`${total - 1} esperando`));
  });

  it("as etiquetas têm ícone de alerta e texto", async () => {
    await sincronizarNoServidor();
    await abrir();
    const item = await screen.findByRole("listitem", { name: "Estorno de compra" });

    const etiqueta = within(item).getByText("Provavelmente ignorar");
    expect(etiqueta.closest("[data-etiqueta]")?.querySelector("svg")).not.toBeNull();
    expect(within(cartao("Salário")).queryByText("Provavelmente ignorar")).toBeNull();
  });

  it("a explicação da etiqueta também é texto, não só title", async () => {
    await sincronizarNoServidor();
    await abrir();
    const item = await screen.findByRole("listitem", { name: "Estorno de compra" });

    expect(item.querySelector("[data-etiqueta='descarte']")?.textContent).toContain(
      "pagamento de fatura",
    );
  });

  it("a categoria aparece em chips direto e as tags só depois de Adicionar tags", async () => {
    await sincronizarNoServidor();
    await abrir();
    const item = await screen.findByRole("listitem", { name: "Farmácia" });

    expect(await within(item).findByLabelText("Conforto")).toBeTruthy();
    expect(within(item).queryByLabelText("Tags")).toBeNull();

    fireEvent.click(within(item).getByRole("button", { name: "Adicionar tags" }));

    const campo = within(item).getByLabelText("Tags");
    expect(document.activeElement).toBe(campo);
    expect(within(item).queryByRole("button", { name: "Adicionar tags" })).toBeNull();
  });

  it("a ação principal é Ignorar na sugerida e Aceitar nas demais", async () => {
    await sincronizarNoServidor();
    await abrir();
    const descartavel = await screen.findByRole("listitem", { name: "Estorno de compra" });
    const comum = cartao("Salário");

    const botoes = (item: HTMLElement) =>
      within(item)
        .getAllByRole("button")
        .filter((b) => /^(Aceitar|Ignorar)/.test(b.getAttribute("aria-label") ?? ""));
    expect(botoes(descartavel)[0].getAttribute("data-principal")).toBe("true");
    expect(botoes(descartavel)[0].getAttribute("aria-label")).toMatch(/^Ignorar/);
    expect(botoes(comum)[0].getAttribute("aria-label")).toMatch(/^Aceitar/);
    expect(botoes(comum)[0].getAttribute("data-principal")).toBe("true");
    expect(botoes(comum)[1].getAttribute("data-principal")).toBeNull();
  });

  it("depois de tratar, o foco vai para o próximo cartão", async () => {
    await sincronizarNoServidor();
    await abrir();
    await esperarCartoes();
    const [primeiro, segundo] = cartoes();
    const nomeDoPrimeiro = tituloDoCartao(primeiro);

    fireEvent.click(within(primeiro).getByRole("button", { name: `Ignorar: ${nomeDoPrimeiro}` }));

    await waitFor(() => expect(screen.queryByRole("listitem", { name: nomeDoPrimeiro })).toBeNull());
    await waitFor(() => {
      const ativo = document.activeElement as HTMLElement;
      expect(ativo.closest("li")?.getAttribute("aria-labelledby")).toBe(
        segundo.getAttribute("aria-labelledby"),
      );
    });
  });

  it("quando o tratado era o último, o foco vai para o título da fila", async () => {
    await sincronizarNoServidor();
    await abrir();
    await esperarCartoes();
    const itens = cartoes();
    const ultimo = itens[itens.length - 1];
    const nome = tituloDoCartao(ultimo);

    fireEvent.click(within(ultimo).getByRole("button", { name: `Ignorar: ${nome}` }));

    await waitFor(() => expect(screen.queryByRole("listitem", { name: nome })).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { level: 2, name: "Caixa de entrada" }),
      ),
    );
  });

  it("ao esvaziar a fila, mostra o estado vazio com Sincronizar agora e o foco no título", async () => {
    await sincronizarNoServidor();
    await abrir();
    await esperarCartoes();
    while (cartoes().length > 0) {
      const [item] = cartoes();
      const nome = tituloDoCartao(item);
      fireEvent.click(within(item).getByRole("button", { name: `Ignorar: ${nome}` }));
      await waitFor(() => expect(screen.queryByRole("listitem", { name: nome })).toBeNull());
    }

    expect(await screen.findByText("Nada esperando você")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Sincronizar agora" })).toHaveLength(1);
    expect(screen.queryByTestId("contagem-da-fila")).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { level: 2, name: "Caixa de entrada" }),
      ),
    );
  });

  it("o cartão tratado sai com movimento e o fantasma não é lido nem focável", async () => {
    await sincronizarNoServidor();
    await abrir();
    const item = await screen.findByRole("listitem", { name: "Estorno de compra" });

    fireEvent.click(within(item).getByRole("button", { name: "Ignorar: Estorno de compra" }));

    await waitFor(() => expect(document.querySelector("[data-saindo]")).not.toBeNull());
    const fantasma = document.querySelector("[data-saindo]") as HTMLElement;
    expect(fantasma.getAttribute("aria-hidden")).toBe("true");
    expect(fantasma.querySelector("button, input")).toBeNull();
    await waitFor(() => expect(document.querySelector("[data-saindo]")).toBeNull());
  });

  it("com menos movimento pedido, o cartão some sem fantasma", async () => {
    definirMidia(true);
    await sincronizarNoServidor();
    await abrir();
    const item = await screen.findByRole("listitem", { name: "Estorno de compra" });

    fireEvent.click(within(item).getByRole("button", { name: "Ignorar: Estorno de compra" }));

    await waitFor(() => expect(screen.queryByRole("listitem", { name: "Estorno de compra" })).toBeNull());
    expect(document.querySelector("[data-saindo]")).toBeNull();
  });
});

describe("textoDaSincronizacao", () => {
  it("conta as novas e avisa das falhas", () => {
    expect(textoDaSincronizacao(0, 0)).toBe("Nenhuma transação nova.");
    expect(textoDaSincronizacao(1, 0)).toBe("1 transação nova na caixa.");
    expect(textoDaSincronizacao(3, 2)).toBe("3 transações novas na caixa. 2 falha(s): tente de novo mais tarde.");
  });
});
