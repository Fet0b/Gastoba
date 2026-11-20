import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../../api/cliente";
import type { Investimento } from "../../api/tipos";
import { limparCache } from "../../api/useConsulta";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { FormularioDeRealocacao } from "./FormularioDeRealocacao";

const investimento: Investimento = {
  id: "posicao-1", nome: "Fundo", tipo: "EQUITY", subtipo: null,
  saldo: "100.00", valor_aplicado: "100.00", rendimento: "0.00", rentabilidade: "0",
  origem_da_rentabilidade: "instituicao", taxa: null, atualizado_em: null,
  alocacao_por_fracao: true,
  destinacoes: [{ tag: "viagem", principal: "100.00", valor_atual: "100.00", rendimento: "0.00", rentabilidade: "0", cor: null }],
};

beforeEach(() => { entrarNaSimulacao(); limparCache(); });

describe("FormularioDeRealocacao com catálogo", () => {
  it("oferece finalidade cadastrada sem outra posição e não escolhe destino automaticamente", async () => {
    await chamar("/destinacoes-cadastradas", { metodo: "POST", corpo: { nome: "estudos" } });
    render(<FormularioDeRealocacao investimento={investimento} aoRealocar={vi.fn()} aoCancelar={vi.fn()} aoFalhar={vi.fn()} />);
    const seletor = await screen.findByLabelText("Levar para a caixinha") as HTMLSelectElement;
    await waitFor(() => expect(Array.from(seletor.options).some((opcao) => opcao.value === "estudos")).toBe(true));
    expect(seletor.value).toBe("");
  });
});
