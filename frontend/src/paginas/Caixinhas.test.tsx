import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../api/cliente";
import type { DestinacaoCadastrada, Investimento } from "../api/tipos";
import { invalidar } from "../api/useConsulta";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { formatar, paraCentavos, deCentavos } from "../dinheiro/dinheiro";
import { entrarNaSimulacao, fetchSimulado } from "../simulacao/fetchSimulado";
import { adicionarInvestimentoSimulado, definirAlocacoesSimuladas } from "../simulacao/manipuladores";
import { Caixinhas } from "./Caixinhas";

beforeEach(() => entrarNaSimulacao());

const MENOS = "\u{2212}";

function navegacao(): Navegacao {
  return { nomeDaPessoa: "Você", tela: "caixinhas", aoIrPara: vi.fn(), aoSair: vi.fn() };
}

async function criar(nome: string, extras: Record<string, unknown> = {}) {
  return chamar<DestinacaoCadastrada>("/destinacoes-cadastradas", { metodo: "POST", corpo: { nome, ...extras } });
}

/** A caixinha já existe por ter parte numa posição: só ajusta o ícone e a cor; senão cria. */
async function garantir(nome: string, extras: { cor?: string; icone?: string } = {}) {
  const existente = (await chamar<DestinacaoCadastrada[]>("/destinacoes-cadastradas")).find((c) => c.nome === nome);
  if (!existente) return criar(nome, extras);
  if (extras.icone) await chamar(`/destinacoes-cadastradas/${existente.id}/icone`, { metodo: "PUT", corpo: { icone: extras.icone } });
  if (extras.cor) await chamar("/cores-das-destinacoes", { metodo: "PUT", corpo: { tag: nome, cor: extras.cor } });
  return existente;
}

/** Duas posições: A reparte entre viagem e casa; B é só da viagem. Mais a caixinha "reserva", vazia. */
async function semear() {
  const a = adicionarInvestimentoSimulado({ nome: "CDB A", tipo: "FIXED_INCOME", saldo: "100.00", valor_aplicado: "90.00", rendimento: "10.00" });
  definirAlocacoesSimuladas(a, { viagem: "60.00", casa: "30.00" });
  const b = adicionarInvestimentoSimulado({ nome: "CDB B", tipo: "FIXED_INCOME", saldo: "50.00", valor_aplicado: "50.00", rendimento: "0.00" });
  definirAlocacoesSimuladas(b, { viagem: "50.00" });
  await garantir("viagem", { cor: "coral", icone: "aviao" });
  await garantir("casa", { icone: "casa" });
  await garantir("reserva");
  return { a, b };
}

async function somasDaApi() {
  const investimentos = await chamar<Investimento[]>("/investimentos");
  const soma = (tag: string, campo: "valor_atual" | "rendimento") =>
    deCentavos(investimentos.flatMap((i) => i.destinacoes).filter((d) => d.tag === tag).reduce((s, d) => s + paraCentavos(d[campo]), 0n));
  return { soma };
}

const cartao = (nome: string) => screen.getByRole("button", { name: new RegExp(`^${nome}`, "i") });

describe("Caixinhas: estados", () => {
  it("tem o cabeçalho com um só h2 e a dica que explica que criar não movimenta dinheiro", async () => {
    render(<Caixinhas navegacao={navegacao()} />);
    await screen.findByText("Nenhuma caixinha ainda");

    const titulo = screen.getByRole("heading", { level: 2, name: "Caixinhas" });
    expect(titulo.closest("header")?.querySelector("p")?.textContent).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Sobre/ }));
    expect(document.body.textContent).toContain("criar ou excluir uma não movimenta dinheiro");
  });

  it("mostra o esqueleto enquanto carrega", async () => {
    vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
    render(<Caixinhas navegacao={navegacao()} />);

    expect(await screen.findByRole("status", { name: /Carregando caixinhas/ })).toBeTruthy();
  });

  it("vazio: uma frase e uma só ação, Criar caixinha (nenhuma no cabeçalho)", async () => {
    render(<Caixinhas navegacao={navegacao()} />);

    expect(await screen.findByText("Nenhuma caixinha ainda")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Criar caixinha" })).toHaveLength(1);
    expect(screen.queryByText(/Guardado em caixinhas/)).toBeNull();
  });

  it("erro: mostra a mensagem e Tentar novamente refaz as duas leituras", async () => {
    let leituras = 0;
    vi.stubGlobal("fetch", (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
      if (opcoes?.method !== "POST" && String(entrada).includes("/destinacoes-cadastradas")) {
        leituras += 1;
        if (leituras === 1) return Promise.resolve(new Response(JSON.stringify({ erro: { codigo: "temporario", mensagem: "Falha temporária." } }), { status: 503 }));
      }
      return fetchSimulado(entrada, opcoes);
    });
    render(<Caixinhas navegacao={navegacao()} />);

    expect(await screen.findByText("Não foi possível carregar as caixinhas.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Nenhuma caixinha ainda")).toBeTruthy();
    expect(leituras).toBe(2);
  });

  it("erro só nos investimentos também mostra o erro (sem valores inventados)", async () => {
    await criar("viagem");
    vi.stubGlobal("fetch", (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
      if (String(entrada).endsWith("/investimentos")) return Promise.resolve(new Response(JSON.stringify({ erro: { codigo: "temporario", mensagem: "Falha." } }), { status: 503 }));
      return fetchSimulado(entrada, opcoes);
    });
    render(<Caixinhas navegacao={navegacao()} />);

    expect(await screen.findByText("Não foi possível carregar as caixinhas.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/R\$/);
  });
});

describe("Caixinhas: dados", () => {
  it("lista as caixinhas do maior valor para o menor, as vazias no fim, com valor e rendimento iguais à soma das partes", async () => {
    await semear();
    const { soma } = await somasDaApi();
    render(<Caixinhas navegacao={navegacao()} />);

    const viagem = await screen.findByRole("button", { name: /^Viagem/ });
    expect(viagem.textContent).toContain(formatar(soma("viagem", "valor_atual")));
    expect(cartao("Casa").textContent).toContain(formatar(soma("casa", "valor_atual")));
    expect(cartao("Reserva").textContent).toContain("R$\u{00A0}0,00");
    const ordem = screen.getAllByRole("button", { name: /^(Casa|Reserva|Viagem)/ }).map((b) => b.textContent?.slice(0, 3));
    expect(ordem).toEqual(["Via", "Cas", "Res"]);
  });

  it("o total em caixinhas é a soma dos valores dos cartões (um só valor de destaque)", async () => {
    await semear();
    const { soma } = await somasDaApi();
    render(<Caixinhas navegacao={navegacao()} />);
    await screen.findByRole("button", { name: /^Viagem/ });

    const total = paraCentavos(soma("viagem", "valor_atual")) + paraCentavos(soma("casa", "valor_atual"));
    const grupo = await screen.findByRole("group", { name: /Guardado em caixinhas/ });
    await waitFor(() => expect(grupo.textContent).toContain(formatar(deCentavos(total))));
  });

  it("rendimento positivo, negativo e zero mostram sinal e data-tom", async () => {
    const a = adicionarInvestimentoSimulado({ nome: "CDB A", tipo: "FIXED_INCOME", saldo: "90.00", valor_aplicado: "100.00", rendimento: "-10.00" });
    definirAlocacoesSimuladas(a, { perda: "100.00" });
    const b = adicionarInvestimentoSimulado({ nome: "CDB B", tipo: "FIXED_INCOME", saldo: "100.00", valor_aplicado: "100.00", rendimento: "0.00" });
    definirAlocacoesSimuladas(b, { zero: "100.00" });
    const c = adicionarInvestimentoSimulado({ nome: "CDB C", tipo: "FIXED_INCOME", saldo: "110.00", valor_aplicado: "100.00", rendimento: "10.00" });
    definirAlocacoesSimuladas(c, { ganho: "100.00" });
    for (const nome of ["perda", "zero", "ganho"]) await garantir(nome);
    render(<Caixinhas navegacao={navegacao()} />);
    await screen.findByRole("button", { name: /^Ganho/ });

    const tom = (nome: string) => cartao(nome).querySelector("[data-parte='rendimento']") as HTMLElement;
    expect(tom("Perda").getAttribute("data-tom")).toBe("negativo");
    expect(tom("Perda").textContent).toContain(`${MENOS}R$`);
    expect(tom("Zero").getAttribute("data-tom")).toBe("neutro");
    expect(tom("Ganho").getAttribute("data-tom")).toBe("positivo");
    expect(tom("Ganho").textContent).toContain("+R$");
  });

  it("abrir leva o foco ao título do painel e fechar devolve o foco ao cartão", async () => {
    await semear();
    render(<Caixinhas navegacao={navegacao()} />);
    const viagem = await screen.findByRole("button", { name: /^Viagem/ });

    fireEvent.click(viagem);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Investimentos em Viagem" }));
    fireEvent.click(viagem);
    expect(document.activeElement).toBe(viagem);
  });

  it("clicar no cartão abre o painel com as posições e fecha de novo; só um painel por vez", async () => {
    await semear();
    render(<Caixinhas navegacao={navegacao()} />);
    const viagem = await screen.findByRole("button", { name: /^Viagem/ });
    expect(viagem.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(viagem);
    expect(viagem.getAttribute("aria-expanded")).toBe("true");
    const painel = document.getElementById(viagem.getAttribute("aria-controls")!)!;
    expect(within(painel).getByText("CDB A")).toBeTruthy();
    expect(within(painel).getByText("CDB B")).toBeTruthy();

    fireEvent.click(cartao("Casa"));
    expect(viagem.getAttribute("aria-expanded")).toBe("false");
    expect(cartao("Casa").getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByText("CDB B")).toBeNull();

    fireEvent.click(cartao("Casa"));
    expect(cartao("Casa").getAttribute("aria-expanded")).toBe("false");
  });

  it("a linha de total da tabela é igual ao valor do cartão", async () => {
    await semear();
    render(<Caixinhas navegacao={navegacao()} />);
    const viagem = await screen.findByRole("button", { name: /^Viagem/ });
    fireEvent.click(viagem);

    const painel = document.getElementById(viagem.getAttribute("aria-controls")!)!;
    const linhas = within(painel).getAllByRole("row");
    const total = linhas[linhas.length - 1]!;
    expect(total.textContent).toContain("Total");
    const valorDoCartao = (viagem.querySelector("[data-parte='valor']") as HTMLElement).textContent;
    expect(total.textContent).toContain(valorDoCartao);
  });

  it("caixinha sem investimento explica e leva a Investimentos", async () => {
    await semear();
    const nav = navegacao();
    render(<Caixinhas navegacao={nav} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Reserva/ }));

    expect(screen.getByText("Ainda não há investimentos nesta caixinha.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Alocar em Investimentos" }));
    expect(nav.aoIrPara).toHaveBeenCalledWith("investimentos");
  });
});

describe("Caixinhas: criar e excluir pela tela", () => {
  it("cria com nome, cor e ícone pelo botão do cabeçalho e o cartão aparece", async () => {
    await criar("casa");
    render(<Caixinhas navegacao={navegacao()} />);
    await screen.findByRole("button", { name: /^Casa/ });

    fireEvent.click(screen.getByRole("button", { name: "Criar caixinha" }));
    const dialogo = await screen.findByRole("dialog", { name: "Criar caixinha" });
    fireEvent.change(within(dialogo).getByLabelText("Nome", { exact: true }), { target: { value: "Viagem" } });
    fireEvent.click(within(dialogo).getByLabelText("Coral"));
    fireEvent.click(within(dialogo).getByLabelText("Avião"));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salvar caixinha" }));

    expect(await screen.findByRole("button", { name: /^Viagem/ })).toBeTruthy();
    const lista = await chamar<DestinacaoCadastrada[]>("/destinacoes-cadastradas");
    expect(lista.find((c) => c.nome === "viagem")).toMatchObject({ cor: "coral", icone: "aviao" });
  });

  it("exclui uma caixinha sem uso: confirmação, depois o cartão some", async () => {
    await criar("reserva");
    await criar("casa");
    render(<Caixinhas navegacao={navegacao()} />);
    await screen.findByRole("button", { name: /^Reserva/ });

    fireEvent.click(screen.getByRole("button", { name: "Mais ações de reserva" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Excluir caixinha" }));
    const confirmar = await screen.findByRole("dialog", { name: "Excluir Reserva?" });
    fireEvent.click(within(confirmar).getByRole("button", { name: "Excluir definitivamente" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: /^Reserva/ })).toBeNull());
    expect(screen.getByRole("button", { name: /^Casa/ })).toBeTruthy();
  });

  it("excluir a última leva ao estado vazio", async () => {
    await criar("reserva");
    render(<Caixinhas navegacao={navegacao()} />);
    await screen.findByRole("button", { name: /^Reserva/ });
    fireEvent.click(screen.getByRole("button", { name: "Mais ações de reserva" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Excluir caixinha" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Excluir Reserva?" })).getByRole("button", { name: "Excluir definitivamente" }));

    expect(await screen.findByText("Nenhuma caixinha ainda")).toBeTruthy();
  });

  it("caixinha com investimentos: a confirmação explica antes e a exclusão fica desabilitada", async () => {
    await semear();
    render(<Caixinhas navegacao={navegacao()} />);
    await screen.findByRole("button", { name: /^Viagem/ });
    fireEvent.click(screen.getByRole("button", { name: "Mais ações de viagem" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Excluir caixinha" }));
    const confirmar = await screen.findByRole("dialog", { name: "Excluir Viagem?" });

    expect(confirmar.textContent).toContain("Esta caixinha tem investimentos e não pode ser excluída. Realoque-os primeiro.");
    expect((within(confirmar).getByRole("button", { name: "Excluir definitivamente" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: /^Viagem/ })).toBeTruthy();
  });

  it("excluída em outra aba com o painel aberto: o painel fecha e a tela avisa", async () => {
    await criar("reserva");
    await criar("casa");
    render(<Caixinhas navegacao={navegacao()} />);
    const reserva = await screen.findByRole("button", { name: /^Reserva/ });
    fireEvent.click(reserva);
    expect(reserva.getAttribute("aria-expanded")).toBe("true");

    const lista = await chamar<DestinacaoCadastrada[]>("/destinacoes-cadastradas");
    await chamar(`/destinacoes-cadastradas/${lista.find((c) => c.nome === "reserva")!.id}`, { metodo: "DELETE" });
    await act(async () => invalidar("destinacoes-cadastradas"));

    await waitFor(() => expect(screen.queryByRole("button", { name: /^Reserva/ })).toBeNull());
    expect(screen.queryByText("Ainda não há investimentos nesta caixinha.")).toBeNull();
    expect(screen.getByText("Esta caixinha não existe mais.")).toBeTruthy();
  });
});

describe("Caixinhas: aparência", () => {
  it("o menu abre Mudar ícone e cor e salvar atualiza o cartão", async () => {
    await semear();
    render(<Caixinhas navegacao={navegacao()} />);
    await screen.findByRole("button", { name: /^Viagem/ });
    fireEvent.click(screen.getByRole("button", { name: "Mais ações de viagem" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mudar ícone e cor" }));

    const dialogo = await screen.findByRole("dialog", { name: "Mudar ícone e cor de Viagem" });
    fireEvent.click(within(dialogo).getByLabelText("Carro"));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Mudar ícone e cor/ })).toBeNull());
    const lista = await chamar<DestinacaoCadastrada[]>("/destinacoes-cadastradas");
    expect(lista.find((c) => c.nome === "viagem")?.icone).toBe("carro");
  });
});
