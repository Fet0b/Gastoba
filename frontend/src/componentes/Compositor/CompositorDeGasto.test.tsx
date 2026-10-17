import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../../api/cliente";
import { useCategorias, useContas, useTags } from "../../api/consultas";
import type { Conta, Gasto, NovoGasto } from "../../api/tipos";
import { entrarNaSimulacao, fetchSimulado } from "../../simulacao/fetchSimulado";
import {
  CompositorDeGasto,
  MENSAGEM_GASTO_REGISTRADO,
  MENSAGEM_SEM_CONTAS,
  MENSAGEM_TAG_PENDENTE,
} from "./CompositorDeGasto";
import { useAtalhoDeNovoGasto } from "./useAtalhoDeNovoGasto";

// Contra o fetch simulado (vazio e sem sessão a cada teste, pelo preparar.ts;
// aqui com a sessão aberta).
beforeEach(() => {
  entrarNaSimulacao();
});

async function criarConta(nome: string, saldo_inicial = "100.00"): Promise<Conta> {
  return chamar<Conta>("/contas", { metodo: "POST", corpo: { nome, saldo_inicial } });
}

async function registrar(novo: NovoGasto): Promise<Gasto> {
  return chamar<Gasto>("/gastos", { metodo: "POST", corpo: novo });
}

type Opcoes = {
  contaInicial?: string | null;
  /** Contas que só o frontend conhece (para forçar o 404 do backend). */
  contasExtras?: Conta[];
  aoRegistrar?: (gasto: Gasto) => void;
  aoFalhar?: (erro: unknown) => void;
};

/** O Painel em miniatura: botão que abre, atalho N e as consultas que alimentam o compositor. */
function ComCompositor({
  contaInicial = null,
  contasExtras = [],
  aoRegistrar = () => {},
  aoFalhar = () => {},
}: Opcoes) {
  const contas = useContas();
  const categorias = useCategorias();
  const tags = useTags();
  const [aberto, definirAberto] = useState(false);
  useAtalhoDeNovoGasto(() => definirAberto(true), !aberto);
  return (
    <>
      <button type="button" onClick={() => definirAberto(true)}>
        Novo gasto
      </button>
      <input aria-label="Busca" />
      {aberto && contas.dados && (
        <CompositorDeGasto
          contas={[...contas.dados, ...contasExtras]}
          categorias={categorias.dados}
          sugestoesDeTags={tags.dados ?? []}
          contaInicial={contaInicial}
          aoRegistrar={aoRegistrar}
          aoFalhar={aoFalhar}
          aoFechar={() => definirAberto(false)}
        />
      )}
    </>
  );
}

function botaoNovoGasto(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Novo gasto" }) as HTMLButtonElement;
}

async function abrir(): Promise<HTMLDialogElement> {
  botaoNovoGasto().focus();
  fireEvent.click(botaoNovoGasto());
  const dialogo = (await screen.findByRole("dialog", { name: "Novo gasto" })) as HTMLDialogElement;
  // As categorias chegam da API.
  await screen.findByLabelText("Conforto");
  return dialogo;
}

function campo<T extends HTMLElement = HTMLInputElement>(rotulo: string): T {
  return screen.getByLabelText(rotulo) as T;
}

function botaoRegistrar(): HTMLButtonElement {
  return screen.getByRole("button", { name: /Registrar gasto|Registrando/ }) as HTMLButtonElement;
}

function descricaoDe(elemento: HTMLElement): string {
  const ids = elemento.getAttribute("aria-describedby") ?? "";
  return ids
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

function preencher({ valor = "2590", descricao = "Mercado", categoria = "Conforto" } = {}): void {
  fireEvent.change(campo("Valor"), { target: { value: valor } });
  fireEvent.change(campo("Descrição"), { target: { value: descricao } });
  fireEvent.click(campo(categoria));
}

function adicionarTag(texto: string): void {
  fireEvent.change(campo("Tags"), { target: { value: texto } });
  fireEvent.keyDown(campo("Tags"), { key: "Enter" });
}

/** Troca o fetch por um espião sobre o simulado; devolve os corpos dos POST /gastos. */
function espiarRegistros(): { corpos: () => unknown[]; espiao: ReturnType<typeof vi.fn> } {
  const espiao = vi.fn(fetchSimulado);
  vi.stubGlobal("fetch", espiao);
  return {
    espiao,
    corpos: () =>
      espiao.mock.calls
        .filter(([, opcoes]) => opcoes?.method === "POST")
        .map(([, opcoes]) => JSON.parse(String(opcoes?.body))),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("CompositorDeGasto", () => {
  it("abre como diálogo modal, com o foco no valor e todos os campos rotulados", async () => {
    await criarConta("Nubank");
    render(<ComCompositor />);
    const dialogo = await abrir();
    expect(dialogo.open).toBe(true);
    expect(document.activeElement).toBe(campo("Valor"));
    expect(campo("Descrição").maxLength).toBe(200);
    expect(campo("Data").type).toBe("date");
    expect(campo<HTMLSelectElement>("Conta").tagName).toBe("SELECT");
    expect(screen.getByRole("radiogroup", { name: "Categoria" })).toBeTruthy();
    expect(campo("Tags").getAttribute("role")).toBe("combobox");
    expect(dialogo.textContent).toContain("Esc");
  });

  it("começa com a data de hoje e a conta selecionada no painel", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 10, 23, 30));
    await criarConta("Carteira");
    const nubank = await criarConta("Nubank");
    render(<ComCompositor contaInicial={nubank.id} />);
    await abrir();
    expect(campo("Data").value).toBe("2026-10-10");
    expect(campo<HTMLSelectElement>("Conta").value).toBe(nubank.id);
  });

  it("sem conta selecionada começa com a primeira", async () => {
    const carteira = await criarConta("Carteira");
    await criarConta("Nubank");
    render(<ComCompositor />);
    await abrir();
    expect(campo<HTMLSelectElement>("Conta").value).toBe(carteira.id);
  });

  it("só habilita o envio com valor, descrição e categoria, explicando o que falta", async () => {
    await criarConta("Nubank");
    render(<ComCompositor />);
    await abrir();
    expect(botaoRegistrar().disabled).toBe(true);
    const explicacao = descricaoDe(botaoRegistrar());
    expect(explicacao).toContain("Informe um valor maior que zero.");
    expect(explicacao).toContain("Escreva uma descrição.");
    expect(explicacao).toContain("Escolha uma categoria.");
    expect(screen.getByText("Informe um valor maior que zero.")).toBeTruthy();

    fireEvent.change(campo("Valor"), { target: { value: "2590" } });
    expect(descricaoDe(botaoRegistrar())).not.toContain("valor");
    fireEvent.change(campo("Descrição"), { target: { value: "   " } });
    expect(descricaoDe(botaoRegistrar())).toContain("Escreva uma descrição.");
    fireEvent.change(campo("Descrição"), { target: { value: "Mercado" } });
    expect(botaoRegistrar().disabled).toBe(true);
    fireEvent.click(campo("Conforto"));
    expect(botaoRegistrar().disabled).toBe(false);
    expect(botaoRegistrar().hasAttribute("aria-describedby")).toBe(false);

    fireEvent.change(campo("Data"), { target: { value: "" } });
    expect(botaoRegistrar().disabled).toBe(true);
    expect(descricaoDe(botaoRegistrar())).toContain("Escolha a data.");
  });

  it("envia o corpo certo, fecha, avisa o painel e devolve o foco ao botão", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 10, 23, 30));
    const conta = await criarConta("Nubank");
    const { corpos } = espiarRegistros();
    const aoRegistrar = vi.fn();
    render(<ComCompositor aoRegistrar={aoRegistrar} />);
    await abrir();

    preencher({ descricao: "  Mercado do mês " });
    adicionarTag("  Pix ");
    adicionarTag("Mercado");
    fireEvent.click(botaoRegistrar());

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(corpos()).toEqual([
      {
        conta_id: conta.id,
        valor: "25.90",
        descricao: "Mercado do mês",
        data: "2026-10-10",
        categoria: "conforto",
        tags: ["pix", "mercado"],
      },
    ]);
    expect(aoRegistrar).toHaveBeenCalledTimes(1);
    expect(aoRegistrar.mock.calls[0][0]).toMatchObject({ valor: "25.90", categoria: "conforto" });
    expect(document.activeElement).toBe(botaoNovoGasto());
    expect(MENSAGEM_GASTO_REGISTRADO).toBe("Gasto registrado.");
  });

  it("Enter com texto nas tags cria a tag e não envia; Enter vazio não é interceptado", async () => {
    await criarConta("Nubank");
    const { corpos } = espiarRegistros();
    render(<ComCompositor />);
    await abrir();
    preencher();

    fireEvent.change(campo("Tags"), { target: { value: "Pix" } });
    expect(fireEvent.keyDown(campo("Tags"), { key: "Enter" })).toBe(false);
    expect(screen.getByRole("button", { name: "Remover tag pix" })).toBeTruthy();
    expect(corpos()).toEqual([]);

    // Sem impedir o padrão, o navegador envia o formulário (envio implícito).
    expect(fireEvent.keyDown(campo("Tags"), { key: "Enter" })).toBe(true);
    fireEvent.submit(campo("Tags").form as HTMLFormElement);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(corpos()).toHaveLength(1);
    expect((corpos()[0] as NovoGasto).tags).toEqual(["pix"]);
  });

  it("texto pendente no campo de tags impede o envio e explica como resolver", async () => {
    await criarConta("Nubank");
    const { corpos } = espiarRegistros();
    render(<ComCompositor />);
    await abrir();
    preencher();
    expect(botaoRegistrar().disabled).toBe(false);

    fireEvent.change(campo("Tags"), { target: { value: "Pix" } });
    expect(botaoRegistrar().disabled).toBe(true);
    expect(descricaoDe(botaoRegistrar())).toContain(MENSAGEM_TAG_PENDENTE);
    // Mesmo um envio forçado (Enter em outro campo) não perde o texto em silêncio.
    fireEvent.submit(campo("Tags").form as HTMLFormElement);
    await act(async () => {});
    expect(corpos()).toEqual([]);
    expect(screen.getByRole("dialog")).toBeTruthy();

    // Só espaços não contam como tag pendente.
    fireEvent.change(campo("Tags"), { target: { value: "   " } });
    expect(botaoRegistrar().disabled).toBe(false);

    fireEvent.change(campo("Tags"), { target: { value: "Pix" } });
    fireEvent.keyDown(campo("Tags"), { key: "Enter" });
    expect(botaoRegistrar().disabled).toBe(false);
    fireEvent.click(botaoRegistrar());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((corpos()[0] as NovoGasto).tags).toEqual(["pix"]);
  });

  it("tag recusada que fica no campo também impede o envio", async () => {
    await criarConta("Nubank");
    render(<ComCompositor />);
    await abrir();
    preencher();
    adicionarTag("a".repeat(31));
    expect(campo("Tags").value).toBe("a".repeat(31));
    expect(botaoRegistrar().disabled).toBe(true);
    expect(descricaoDe(botaoRegistrar())).toContain(MENSAGEM_TAG_PENDENTE);
  });

  it("sugere as tags já usadas", async () => {
    const conta = await criarConta("Nubank");
    await registrar({
      conta_id: conta.id,
      valor: "1.00",
      descricao: "Café",
      data: "2026-10-01",
      categoria: "lazer",
      tags: ["café", "pix"],
    });
    render(<ComCompositor />);
    await abrir();
    fireEvent.change(campo("Tags"), { target: { value: "p" } });
    await screen.findByRole("option", { name: "pix" });
  });

  it("duplo clique envia uma vez só", async () => {
    await criarConta("Nubank");
    const { corpos } = espiarRegistros();
    render(<ComCompositor />);
    await abrir();
    preencher();
    fireEvent.click(botaoRegistrar());
    fireEvent.click(botaoRegistrar());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(corpos()).toHaveLength(1);
  });

  it("enquanto envia, o botão fica desabilitado e diz que está registrando", async () => {
    await criarConta("Nubank");
    let liberar: () => void = () => {};
    const segurar = new Promise<void>((resolver) => {
      liberar = resolver;
    });
    vi.stubGlobal("fetch", async (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
      if (opcoes?.method === "POST") await segurar;
      return fetchSimulado(entrada, opcoes);
    });
    render(<ComCompositor />);
    await abrir();
    preencher();
    fireEvent.click(botaoRegistrar());
    await waitFor(() => expect(botaoRegistrar().textContent).toBe("Registrando…"));
    expect(botaoRegistrar().disabled).toBe(true);
    expect(screen.getByRole("dialog").querySelector("form")?.getAttribute("aria-busy")).toBe("true");
    await act(async () => liberar());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("conta inexistente no backend mantém aberto com a mensagem junto à conta", async () => {
    await criarConta("Nubank");
    const fantasma: Conta = {
      id: "00000000-0000-4000-8000-000000000000",
      nome: "Apagada",
      saldo: "0.00",
      origem: "manual",
      tipo: "corrente",
    };
    const aoFalhar = vi.fn();
    const aoRegistrar = vi.fn();
    render(<ComCompositor contaInicial={fantasma.id} contasExtras={[fantasma]} aoFalhar={aoFalhar} aoRegistrar={aoRegistrar} />);
    await abrir();
    preencher();
    fireEvent.click(botaoRegistrar());

    await waitFor(() => expect(aoFalhar).toHaveBeenCalledTimes(1));
    const conta = campo<HTMLSelectElement>("Conta");
    expect(conta.getAttribute("aria-invalid")).toBe("true");
    expect(descricaoDe(conta)).toContain("Conta");
    expect(document.activeElement).toBe(conta);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(aoRegistrar).not.toHaveBeenCalled();
  });

  it("liga os detalhes do 422 aos campos correspondentes", async () => {
    await criarConta("Nubank");
    vi.stubGlobal("fetch", async (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
      if (opcoes?.method !== "POST") return fetchSimulado(entrada, opcoes);
      const corpo = {
        erro: {
          codigo: "requisicao_invalida",
          mensagem: "Requisição inválida.",
          detalhes: [
            { campo: "body.descricao", mensagem: "Descrição recusada." },
            { campo: "body.categoria", mensagem: "Categoria recusada." },
            { campo: "body.tags.0", mensagem: "Tag recusada." },
            { campo: "body.data", mensagem: "Data recusada." },
          ],
        },
      };
      return new Response(JSON.stringify(corpo), {
        status: 422,
        headers: { "content-type": "application/json" },
      });
    });
    render(<ComCompositor />);
    await abrir();
    preencher();
    fireEvent.click(botaoRegistrar());

    await waitFor(() => expect(descricaoDe(campo("Descrição"))).toContain("Descrição recusada."));
    expect(campo("Descrição").getAttribute("aria-invalid")).toBe("true");
    expect(descricaoDe(screen.getByRole("radiogroup", { name: "Categoria" }))).toContain(
      "Categoria recusada.",
    );
    expect(descricaoDe(campo("Tags"))).toContain("Tag recusada.");
    expect(descricaoDe(campo("Data"))).toContain("Data recusada.");
    expect(campo("Valor").hasAttribute("aria-invalid")).toBe(false);
    // O foco muda num efeito, que pode rodar depois de as mensagens aparecerem.
    await waitFor(() => expect(document.activeElement).toBe(campo("Descrição")));
  });

  it("valor recusado pelo backend aparece junto ao valor", async () => {
    // Saldo perto do limite negativo: o débito passaria do limite e o backend recusa.
    await criarConta("Nubank", "-999999999999.00");
    render(<ComCompositor />);
    await abrir();
    preencher({ valor: "500000" });
    fireEvent.click(botaoRegistrar());
    await waitFor(() => expect(campo("Valor").getAttribute("aria-invalid")).toBe("true"));
    expect(descricaoDe(campo("Valor")).length).toBeGreaterThan(0);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("sem resposta do servidor mostra a mensagem no diálogo e avisa o painel", async () => {
    await criarConta("Nubank");
    const aoFalhar = vi.fn();
    render(<ComCompositor aoFalhar={aoFalhar} />);
    await abrir();
    preencher();
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    fireEvent.click(botaoRegistrar());
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("Não foi possível falar com o servidor.");
    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("Esc fecha e o foco volta ao botão que abriu", async () => {
    await criarConta("Nubank");
    render(<ComCompositor />);
    await abrir();
    const naoImpedido = fireEvent.keyDown(campo("Descrição"), { key: "Escape" });
    expect(naoImpedido).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(botaoNovoGasto());
  });

  it("o evento cancel do diálogo também fecha de forma controlada", async () => {
    await criarConta("Nubank");
    render(<ComCompositor />);
    const dialogo = await abrir();
    const cancelar = new Event("cancel", { cancelable: true });
    fireEvent(dialogo, cancelar);
    expect(cancelar.defaultPrevented).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Esc com as sugestões de tag abertas só fecha as sugestões", async () => {
    const conta = await criarConta("Nubank");
    await registrar({
      conta_id: conta.id,
      valor: "1.00",
      descricao: "Café",
      data: "2026-10-01",
      categoria: "lazer",
      tags: ["pix"],
    });
    render(<ComCompositor />);
    await abrir();
    fireEvent.change(campo("Tags"), { target: { value: "p" } });
    await screen.findByRole("option", { name: "pix" });
    fireEvent.keyDown(campo("Tags"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(campo("Tags").getAttribute("aria-expanded")).toBe("false");
  });

  it("o botão Cancelar fecha", async () => {
    await criarConta("Nubank");
    render(<ComCompositor />);
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("N abre o compositor, mas não dentro de um campo nem com Ctrl", async () => {
    await criarConta("Nubank");
    render(<ComCompositor />);
    await waitFor(() => expect(botaoNovoGasto()).toBeTruthy());

    fireEvent.keyDown(campo("Busca"), { key: "n" });
    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.keyDown(document.body, { key: "n" });
    await screen.findByRole("dialog", { name: "Novo gasto" });
  });

  it("sem contas explica que é preciso criar uma", () => {
    render(
      <CompositorDeGasto
        contas={[]}
        categorias={[]}
        sugestoesDeTags={[]}
        contaInicial={null}
        aoRegistrar={() => {}}
        aoFalhar={() => {}}
        aoFechar={() => {}}
      />,
    );
    expect(botaoRegistrar().disabled).toBe(true);
    expect(descricaoDe(botaoRegistrar())).toContain(MENSAGEM_SEM_CONTAS);
  });
});
