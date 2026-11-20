import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../../api/cliente";
import { fetchSimulado } from "../../simulacao/fetchSimulado";
import type { Investimento } from "../../api/tipos";
import { limparCache } from "../../api/useConsulta";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { DefinirDestinacoes } from "./DefinirDestinacoes";

const investimento: Investimento = {
  id: "posicao-1", nome: "Fundo", tipo: "EQUITY", subtipo: null,
  saldo: "150.00", valor_aplicado: "150.00", rendimento: "0.00", rentabilidade: "0",
  origem_da_rentabilidade: "instituicao", taxa: null, atualizado_em: null,
  alocacao_por_fracao: true,
  destinacoes: [
    { tag: "viagem", principal: "100.00", valor_atual: "100.00", rendimento: "0.00", rentabilidade: "0", cor: null },
    { tag: null, principal: "0.00", valor_atual: "50.00", rendimento: "0.00", rentabilidade: null, cor: null },
  ],
};

beforeEach(() => { entrarNaSimulacao(); limparCache(); });

describe("DefinirDestinacoes com catálogo", () => {
  it("mostra falha de carga, oferece retry e mantém campos livres legados", async () => {
    let leituras = 0;
    vi.stubGlobal("fetch", (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
      if (opcoes?.method !== "POST" && String(entrada).includes("/destinacoes-cadastradas")) {
        leituras += 1;
        if (leituras === 1) return Promise.resolve(new Response(JSON.stringify({ erro: { codigo: "temporario", mensagem: "Falha temporária." } }), { status: 503 }));
      }
      return fetchSimulado(entrada, opcoes);
    });
    render(<DefinirDestinacoes investimento={investimento} aoDefinir={vi.fn()} aoCancelar={vi.fn()} aoFalhar={vi.fn()} />);
    expect(await screen.findByText("Não foi possível carregar as caixinhas cadastradas.")).toBeTruthy();
    expect(screen.getByLabelText("Tag da destinação 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(leituras).toBe(2));
    expect(screen.queryByText("Não foi possível carregar as caixinhas cadastradas.")).toBeNull();
  });

  it("sugere finalidade cadastrada sem posição, mantém o campo sem pré-seleção e deixa a alocação a cargo da pessoa", async () => {
    await chamar("/destinacoes-cadastradas", { metodo: "POST", corpo: { nome: "estudos" } });
    render(<DefinirDestinacoes investimento={investimento} aoDefinir={vi.fn()} aoCancelar={vi.fn()} aoFalhar={vi.fn()} />);
    const campo = await screen.findByLabelText("Tag da destinação 1") as HTMLInputElement;
    await waitFor(() => expect(document.querySelector('datalist option[value="estudos"]')).toBeTruthy());
    expect(campo.value).toBe("");
    expect(screen.getByText(/o valor sem caixinha/)).toBeTruthy();
  });

  it("permite destinar valor fracionário a uma finalidade cadastrada em outra posição", async () => {
    await chamar("/destinacoes-cadastradas", { metodo: "POST", corpo: { nome: "estudos" } });
    render(<DefinirDestinacoes investimento={investimento} aoDefinir={vi.fn()} aoCancelar={vi.fn()} aoFalhar={vi.fn()} />);
    const campo = await screen.findByLabelText("Tag da destinação 1");
    await waitFor(() => expect(document.querySelector('datalist option[value="estudos"]')).toBeTruthy());

    fireEvent.change(campo, { target: { value: "estudos" } });

    expect((screen.getByRole("button", { name: "Salvar caixinhas" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
