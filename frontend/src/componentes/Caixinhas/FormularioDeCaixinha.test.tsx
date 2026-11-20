import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { entrarNaSimulacao, fetchSimulado } from "../../simulacao/fetchSimulado";
import { FormularioDeCaixinha } from "./FormularioDeCaixinha";

beforeEach(() => entrarNaSimulacao());

function montar(aoCriar = vi.fn()) {
  const aoFechar = vi.fn();
  function Harness() {
    const [aberto, definirAberto] = useState(true);
    return (
      <>
        <button onClick={() => definirAberto(true)}>Criar caixinha</button>
        <FormularioDeCaixinha
          aberto={aberto}
          aoFechar={() => { aoFechar(); definirAberto(false); }}
          aoCriar={aoCriar}
          devolverFocoPara={{ current: screen.queryByRole("button", { name: "Criar caixinha" }) }}
        />
      </>
    );
  }
  render(<Harness />);
  return { aoFechar, aoCriar };
}

const salvar = () => screen.getByRole("button", { name: "Salvar caixinha" });
const nomeDoCampo = () => screen.getByLabelText("Nome", { exact: true }) as HTMLInputElement;

describe("FormularioDeCaixinha", () => {
  it("abre com Nome, a cor Automática e o ícone Cofre marcados, e a explicação", async () => {
    montar();
    const dialogo = await screen.findByRole("dialog", { name: "Criar caixinha" });

    expect(dialogo.textContent).toContain("Criar uma não movimenta dinheiro nem cria uma posição.");
    expect(screen.getByText("Use de 1 a 30 caracteres.", { exact: true })).toBeTruthy();
    expect((within(screen.getByRole("group", { name: "Cor" })).getByLabelText("Automática") as HTMLInputElement).checked).toBe(true);
    expect((within(screen.getByRole("group", { name: "Ícone" })).getByLabelText("Cofre") as HTMLInputElement).checked).toBe(true);
    expect(within(screen.getByRole("group", { name: "Cor" })).getAllByRole("radio")).toHaveLength(9);
    expect(within(screen.getByRole("group", { name: "Ícone" })).getAllByRole("radio")).toHaveLength(6);
    expect(dialogo.textContent).not.toMatch(/R\$|saldo|investido/i);
  });

  it("os campos vêm na ordem Nome, Ícone, Cor", async () => {
    montar();
    const dialogo = await screen.findByRole("dialog", { name: "Criar caixinha" });
    const ordem = [...dialogo.querySelectorAll("input[type=text], fieldset legend")].map((e) => e.tagName === "LEGEND" ? e.firstChild?.textContent : "Nome");

    expect(ordem).toEqual(["Nome", "Ícone", "Cor"]);
  });

  it("envia a cor e o ícone escolhidos no mesmo POST e o catálogo os devolve", async () => {
    const corpos: unknown[] = [];
    vi.stubGlobal("fetch", (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
      if (opcoes?.method === "POST" && String(entrada).includes("/destinacoes-cadastradas")) corpos.push(JSON.parse(String(opcoes.body)));
      return fetchSimulado(entrada, opcoes);
    });
    const { aoCriar, aoFechar } = montar();
    await screen.findByRole("dialog", { name: "Criar caixinha" });
    fireEvent.change(nomeDoCampo(), { target: { value: "  VIAGEM   São João " } });
    fireEvent.click(within(screen.getByRole("group", { name: "Cor" })).getByLabelText("Coral"));
    fireEvent.click(within(screen.getByRole("group", { name: "Ícone" })).getByLabelText("Avião"));
    fireEvent.click(salvar());

    await waitFor(() => expect(aoCriar).toHaveBeenCalledTimes(1));
    expect(corpos).toEqual([{ nome: "viagem são joão", cor: "coral", icone: "aviao" }]);
    expect(aoCriar.mock.calls[0]?.[0]).toMatchObject({ nome: "viagem são joão", cor: "coral", icone: "aviao" });
    expect(aoFechar).toHaveBeenCalled();
  });

  it("com os padrões não envia cor nem ícone e não cria efeito financeiro", async () => {
    const corpos: unknown[] = [];
    vi.stubGlobal("fetch", (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
      if (opcoes?.method === "POST" && String(entrada).includes("/destinacoes-cadastradas")) corpos.push(JSON.parse(String(opcoes.body)));
      return fetchSimulado(entrada, opcoes);
    });
    const { aoCriar } = montar();
    await screen.findByRole("dialog", { name: "Criar caixinha" });
    fireEvent.change(nomeDoCampo(), { target: { value: "Reserva" } });
    fireEvent.click(salvar());

    await waitFor(() => expect(aoCriar).toHaveBeenCalled());
    expect(corpos).toEqual([{ nome: "reserva" }]);
    expect(await fetchSimulado("http://localhost:8000/contas", { credentials: "include" }).then((r) => r.json())).toEqual([]);
    expect(await fetchSimulado("http://localhost:8000/investimentos", { credentials: "include" }).then((r) => r.json())).toEqual([]);
  });

  it("valida o tamanho do nome antes de enviar", async () => {
    const { aoCriar } = montar();
    await screen.findByRole("dialog", { name: "Criar caixinha" });
    fireEvent.change(nomeDoCampo(), { target: { value: "x".repeat(31) } });
    fireEvent.click(salvar());

    expect((await screen.findByRole("alert")).textContent).toContain("A tag deve ter de 1 a 30 caracteres.");
    expect(aoCriar).not.toHaveBeenCalled();
  });

  it.each(["", "   "])("nome vazio (%j): o erro aparece junto ao campo, ligado por aria-describedby, sem chamar a API", async (texto) => {
    const posts = vi.fn();
    vi.stubGlobal("fetch", (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
      if (opcoes?.method === "POST") posts();
      return fetchSimulado(entrada, opcoes);
    });
    const { aoCriar } = montar();
    await screen.findByRole("dialog", { name: "Criar caixinha" });
    fireEvent.change(nomeDoCampo(), { target: { value: texto } });
    fireEvent.click(salvar());

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("1 a 30 caracteres");
    expect(nomeDoCampo().getAttribute("aria-invalid")).toBe("true");
    expect(nomeDoCampo().getAttribute("aria-describedby")).toContain(alerta.id);
    expect(posts).not.toHaveBeenCalled();
    expect(aoCriar).not.toHaveBeenCalled();
  });

  it("bloqueia envio duplicado enquanto aguarda e preserva a entrada após erro de servidor", async () => {
    let resolver!: (resposta: Response) => void;
    vi.stubGlobal("fetch", (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
      if (opcoes?.method === "POST" && String(entrada).includes("/destinacoes-cadastradas")) {
        return new Promise<Response>((resolve) => { resolver = resolve; });
      }
      return fetchSimulado(entrada, opcoes);
    });
    montar();
    await screen.findByRole("dialog", { name: "Criar caixinha" });
    fireEvent.change(nomeDoCampo(), { target: { value: "Viagem" } });
    fireEvent.click(within(screen.getByRole("group", { name: "Cor" })).getByLabelText("Céu"));
    const botao = salvar();
    fireEvent.submit(botao.closest("dialog")!.querySelector("form")!);
    await waitFor(() => expect((botao as HTMLButtonElement).disabled).toBe(true));
    await waitFor(() => expect(resolver).toBeTypeOf("function"));
    fireEvent.submit(botao.closest("dialog")!.querySelector("form")!);
    resolver(new Response(JSON.stringify({ erro: { codigo: "temporario", mensagem: "Tente novamente." } }), { status: 503 }));

    expect(await screen.findByText("Tente novamente.", { exact: true })).toBeTruthy();
    expect(nomeDoCampo().value).toBe("Viagem");
    expect((within(screen.getByRole("group", { name: "Cor" })).getByLabelText("Céu") as HTMLInputElement).checked).toBe(true);
    expect((botao as HTMLButtonElement).disabled).toBe(false);
  });

  it("mantém a entrada em conflito 409 e em falha de rede", async () => {
    let modo: "conflito" | "rede" = "conflito";
    vi.stubGlobal("fetch", (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
      if (opcoes?.method === "POST" && String(entrada).includes("/destinacoes-cadastradas")) {
        if (modo === "rede") return Promise.reject(new TypeError("sem rede"));
        return Promise.resolve(new Response(JSON.stringify({ erro: { codigo: "destinacao_ja_cadastrada", mensagem: "Já existe uma caixinha com esse nome." } }), { status: 409 }));
      }
      return fetchSimulado(entrada, opcoes);
    });
    montar();
    await screen.findByRole("dialog", { name: "Criar caixinha" });
    fireEvent.change(nomeDoCampo(), { target: { value: "Viagem" } });
    fireEvent.click(salvar());
    expect((await screen.findByRole("alert")).textContent).toContain("Já existe");
    expect(nomeDoCampo().value).toBe("Viagem");

    modo = "rede";
    fireEvent.click(salvar());
    expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível falar com o servidor.");
    expect(nomeDoCampo().value).toBe("Viagem");
  });

  it("avisa antes de descartar formulário alterado e devolve o foco ao fechar", async () => {
    const { aoFechar } = montar();
    await screen.findByRole("dialog", { name: "Criar caixinha" });
    fireEvent.change(nomeDoCampo(), { target: { value: "Viagem" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    const confirmarDescarte = await screen.findByRole("dialog", { name: "Descartar formulário?" });
    expect(screen.queryByRole("dialog", { name: "Criar caixinha" })).toBeNull();
    fireEvent.click(within(confirmarDescarte).getByRole("button", { name: "Cancelar" }));
    expect(nomeDoCampo().value).toBe("Viagem");
    expect(aoFechar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Descartar formulário?" })).getByRole("button", { name: "Descartar" }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Criar caixinha" })));
  });

  it("mudar só a cor ou o ícone também conta como alteração", async () => {
    montar();
    await screen.findByRole("dialog", { name: "Criar caixinha" });
    fireEvent.click(within(screen.getByRole("group", { name: "Ícone" })).getByLabelText("Casa"));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(await screen.findByRole("dialog", { name: "Descartar formulário?" })).toBeTruthy();
  });

  it("avisa ao fechar mesmo quando a pessoa alterou e depois apagou o campo", async () => {
    montar();
    await screen.findByRole("dialog", { name: "Criar caixinha" });
    fireEvent.change(nomeDoCampo(), { target: { value: "Viagem" } });
    fireEvent.change(nomeDoCampo(), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(await screen.findByRole("dialog", { name: "Descartar formulário?" })).toBeTruthy();
  });

  it("sem alteração, Cancelar fecha direto", async () => {
    const { aoFechar } = montar();
    await screen.findByRole("dialog", { name: "Criar caixinha" });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Descartar formulário?" })).toBeNull();
  });

  it("reabre limpo depois de fechar", async () => {
    montar();
    await screen.findByRole("dialog", { name: "Criar caixinha" });
    fireEvent.change(nomeDoCampo(), { target: { value: "Viagem" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Descartar formulário?" })).getByRole("button", { name: "Descartar" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar caixinha" }));

    expect(nomeDoCampo().value).toBe("");
  });
});

describe("FormularioDeCaixinha: espaçamento", () => {
  it("a explicação tem o mesmo espaço (token) que separa os grupos, não colado ao campo Nome", async () => {
    montar();
    const dialogo = await screen.findByRole("dialog", { name: "Criar caixinha" });
    const explicacao = dialogo.querySelector("p") as HTMLElement;

    expect(explicacao.className).toMatch(/introducao/);
  });
});
