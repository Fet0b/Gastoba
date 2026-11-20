import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { chamar } from "../../api/cliente";
import type { Investimento, MovimentoDeInvestimento, Sincronizacao } from "../../api/tipos";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { adicionarInvestimentoSimulado } from "../../simulacao/manipuladores";
import { Aviso, type MensagemDoAviso } from "../Aviso/Aviso";
import { CaixaDeEntrada } from "./CaixaDeEntrada";

beforeEach(() => {
  entrarNaSimulacao();
});

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

async function abrir(): Promise<HTMLElement> {
  await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
  render(<ComAviso />);
  return screen.findByRole("listitem", { name: "Salário" });
}

describe("resgate de posição sem caixinhas na caixa de entrada", () => {
  it("não pede destinações, explica e aceita só com a posição", async () => {
    const id = adicionarInvestimentoSimulado({ nome: "CDB sem caixinhas", tipo: "FIXED_INCOME", saldo: "500.00" });
    const item = await abrir();

    fireEvent.click(within(item).getByRole("radio", { name: "Resgate" }));
    fireEvent.change(within(item).getByLabelText("Investimento"), { target: { value: id } });

    expect(within(item).queryByLabelText("Tag da destinação 1")).toBeNull();
    expect(item.textContent).toContain("Esta posição não tem caixinhas; o resgate fica só na posição.");
    // O leitor de tela é avisado de que as destinações sumiram.
    const aviso = within(item).getByRole("status");
    expect(within(item).getByLabelText("Investimento").getAttribute("aria-describedby")).toBe(aviso.id);
    const aceitar = within(item).getByRole("button", { name: /Aceitar como resgate/ }) as HTMLButtonElement;
    expect(aceitar.disabled).toBe(false);
    fireEvent.click(aceitar);

    expect(await screen.findByText("Resgate registrado.")).toBeTruthy();
    const movimentos = await chamar<MovimentoDeInvestimento[]>("/movimentos-de-investimento", {
      parametros: { inicio: "2000-01-01", fim: "2999-12-31" },
    });
    const resgate = movimentos.find((m) => m.tipo === "resgate");
    expect(resgate?.investimento_id).toBe(id);
    expect(resgate?.destinacoes).toEqual([]);
    await waitFor(() => expect(screen.queryByRole("listitem", { name: "Salário" })).toBeNull());
  });

  it("com caixinhas na posição, as destinações continuam à vista", async () => {
    const id = adicionarInvestimentoSimulado({ nome: "CDB com caixinhas", tipo: "FIXED_INCOME", saldo: "500.00" });
    await chamar("/investimentos/" + id + "/destinacoes", {
      metodo: "POST",
      corpo: { destinacoes: [{ tag: "casa", percentual: 100 }] },
    });
    const item = await abrir();

    fireEvent.click(within(item).getByRole("radio", { name: "Resgate" }));
    fireEvent.change(within(item).getByLabelText("Investimento"), { target: { value: id } });

    expect(within(item).getByLabelText("Tag da destinação 1")).toBeTruthy();
    expect(item.textContent).not.toContain("não tem caixinhas");
    const posicoes = await chamar<Investimento[]>("/investimentos");
    expect(posicoes.find((p) => p.id === id)?.destinacoes.some((d) => d.tag === "casa")).toBe(true);
  });
});
