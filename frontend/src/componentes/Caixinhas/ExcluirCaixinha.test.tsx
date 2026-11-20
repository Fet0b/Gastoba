import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../../api/cliente";
import { entrarNaSimulacao, fetchSimulado } from "../../simulacao/fetchSimulado";
import { ExcluirCaixinha } from "./ExcluirCaixinha";

beforeEach(() => entrarNaSimulacao());

async function criar(nome: string) {
  return chamar<{ id: string; nome: string }>("/destinacoes-cadastradas", { metodo: "POST", corpo: { nome } });
}

function montar(caixinha: { id: string; nome: string }) {
  const aoCancelar = vi.fn();
  const aoExcluir = vi.fn();
  render(<ExcluirCaixinha caixinha={caixinha} aoCancelar={aoCancelar} aoExcluir={aoExcluir} />);
  return { aoCancelar, aoExcluir };
}

describe("ExcluirCaixinha", () => {
  it("abre com foco em Cancelar e explica que cor e ícone saem junto", async () => {
    const caixinha = await criar("viagem");
    montar(caixinha);
    const dialogo = await screen.findByRole("dialog", { name: "Excluir Viagem?" });

    expect(document.activeElement).toBe(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(dialogo.textContent).toContain("A cor e o ícone dela também são apagados")
    expect(dialogo.textContent).toContain("Nenhum lançamento ou investimento é apagado.")
    expect(dialogo.textContent).not.toMatch(/cascata/);
  });

  it("Cancelar não exclui", async () => {
    const caixinha = await criar("viagem");
    const { aoCancelar, aoExcluir } = montar(caixinha);
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Excluir Viagem?" })).getByRole("button", { name: "Cancelar" }));

    expect(aoCancelar).toHaveBeenCalledTimes(1);
    expect(aoExcluir).not.toHaveBeenCalled();
    expect(await chamar<unknown[]>("/destinacoes-cadastradas")).toHaveLength(1);
  });

  it("confirmar exclui e avisa", async () => {
    const caixinha = await criar("viagem");
    const { aoExcluir } = montar(caixinha);
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Excluir Viagem?" })).getByRole("button", { name: "Excluir definitivamente" }));

    await waitFor(() => expect(aoExcluir).toHaveBeenCalledWith("excluida"));
    expect(await chamar<unknown[]>("/destinacoes-cadastradas")).toEqual([]);
  });

  it("com investimentos na caixinha explica antes e desabilita a exclusão com o motivo", async () => {
    const caixinha = await criar("viagem");
    const aoExcluir = vi.fn();
    render(<ExcluirCaixinha caixinha={caixinha} emUso aoCancelar={vi.fn()} aoExcluir={aoExcluir} />);
    const dialogo = await screen.findByRole("dialog", { name: "Excluir Viagem?" });
    const acao = within(dialogo).getByRole("button", { name: "Excluir definitivamente" }) as HTMLButtonElement;

    expect(dialogo.textContent).toContain("Esta caixinha tem investimentos e não pode ser excluída. Realoque-os primeiro.");
    expect(acao.disabled).toBe(true);
    expect(acao.getAttribute("aria-describedby")).toBeTruthy();
    fireEvent.click(acao);
    expect(aoExcluir).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(within(dialogo).getByRole("button", { name: "Cancelar" }));
  });

  it("409 da API desabilita a ação, anuncia o erro e leva o foco ao Cancelar (nunca ao body)", async () => {
    const caixinha = await criar("viagem");
    vi.stubGlobal("fetch", (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
      if (opcoes?.method === "DELETE") {
        return Promise.resolve(new Response(JSON.stringify({ erro: { codigo: "destinacao_em_uso", mensagem: "Esta caixinha tem uso ou histórico e não pode ser excluída." } }), { status: 409 }));
      }
      return fetchSimulado(entrada, opcoes);
    });
    montar(caixinha);
    const dialogo = await screen.findByRole("dialog", { name: "Excluir Viagem?" });
    const acao = within(dialogo).getByRole("button", { name: "Excluir definitivamente" }) as HTMLButtonElement;
    fireEvent.click(acao);

    expect((await within(dialogo).findByRole("alert")).textContent).toContain("uso ou histórico");
    await waitFor(() => expect(acao.disabled).toBe(true));
    await waitFor(() => expect(document.activeElement).toBe(within(dialogo).getByRole("button", { name: "Cancelar" })));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("409 fica dentro do diálogo e não avisa exclusão", async () => {
    const caixinha = await criar("viagem");
    vi.stubGlobal("fetch", (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
      if (opcoes?.method === "DELETE") {
        return Promise.resolve(new Response(JSON.stringify({ erro: { codigo: "destinacao_em_uso", mensagem: "Esta caixinha tem uso ou histórico e não pode ser excluída." } }), { status: 409 }));
      }
      return fetchSimulado(entrada, opcoes);
    });
    const { aoExcluir } = montar(caixinha);
    const dialogo = await screen.findByRole("dialog", { name: "Excluir Viagem?" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Excluir definitivamente" }));

    expect((await within(dialogo).findByRole("alert")).textContent).toContain("uso ou histórico");
    expect(aoExcluir).not.toHaveBeenCalled();
  });

  it("404 concorrente avisa que já foi removida", async () => {
    const caixinha = await criar("reserva");
    await chamar(`/destinacoes-cadastradas/${caixinha.id}`, { metodo: "DELETE" });
    const { aoExcluir } = montar(caixinha);
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Excluir Reserva?" })).getByRole("button", { name: "Excluir definitivamente" }));

    await waitFor(() => expect(aoExcluir).toHaveBeenCalledWith("ja_removida"));
  });

  it("envia só uma exclusão enquanto aguarda e bloqueia os controles", async () => {
    const caixinha = await criar("reserva");
    let resolver!: (resposta: Response) => void;
    const exclusoes = vi.fn();
    vi.stubGlobal("fetch", (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
      if (opcoes?.method === "DELETE") {
        exclusoes();
        return new Promise<Response>((resolve) => { resolver = resolve; });
      }
      return fetchSimulado(entrada, opcoes);
    });
    const { aoExcluir } = montar(caixinha);
    const excluir = within(await screen.findByRole("dialog", { name: "Excluir Reserva?" })).getByRole("button", { name: "Excluir definitivamente" });
    fireEvent.click(excluir);
    await waitFor(() => expect((excluir as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(excluir);
    expect(exclusoes).toHaveBeenCalledTimes(1);
    resolver(new Response(null, { status: 204 }));

    await waitFor(() => expect(aoExcluir).toHaveBeenCalledWith("excluida"));
  });

  it("sem caixinha escolhida o diálogo fica fechado", () => {
    render(<ExcluirCaixinha caixinha={null} aoCancelar={vi.fn()} aoExcluir={vi.fn()} />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
