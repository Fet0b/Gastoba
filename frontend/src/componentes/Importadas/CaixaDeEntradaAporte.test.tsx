import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { chamar } from "../../api/cliente";
import type { Gasto, Investimento, MovimentoDeInvestimento, Sincronizacao } from "../../api/tipos";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { adicionarInvestimentoSimulado } from "../../simulacao/manipuladores";
import { Aviso, type MensagemDoAviso } from "../Aviso/Aviso";
import { CaixaDeEntrada } from "./CaixaDeEntrada";

beforeEach(() => {
  entrarNaSimulacao();
});

const PERIODO_LARGO = { inicio: "2000-01-01", fim: "2999-12-31" };

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
  await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
  render(<ComAviso />);
  await screen.findByRole("listitem", { name: "Mercado Extra" });
}

const gastos = () => chamar<Gasto[]>("/gastos", { parametros: PERIODO_LARGO });
const movimentos = () =>
  chamar<MovimentoDeInvestimento[]>("/movimentos-de-investimento", { parametros: PERIODO_LARGO });

describe("a categoria Investimentos na caixa de entrada", () => {
  it("aparece na saída e escolhê-la abre o editor de aporte; outra categoria volta para gasto", async () => {
    await abrir();
    const item = screen.getByRole("listitem", { name: "Farmácia" });

    fireEvent.click(within(item).getByRole("radio",{name:"Aporte"}));

    expect(within(item).getByLabelText("Investimento")).toBeTruthy();
    expect(within(item).getByRole("button", { name: /Aceitar como aporte/ })).toBeTruthy();
    expect(within(item).queryByLabelText("Investimentos")).toBeNull();
    expect(within(item).queryByLabelText("Categoria de despesa (opcional)")).toBeNull();

    fireEvent.click(within(item).getByRole("radio",{name:"Gasto"}));
    fireEvent.click(within(item).getByLabelText("Lazer"));
    expect(within(item).queryByLabelText("Investimento")).toBeNull();
    expect(within(item).getByRole("button", { name: /Aceitar como gasto/ })).toBeTruthy();

    fireEvent.click(within(item).getByRole("radio",{name:"Aporte"}));
    fireEvent.click(within(item).getByRole("button", { name: /Aceitar como aporte/ }));

    expect(await screen.findByText("Aporte registrado.")).toBeTruthy();
    expect(await gastos()).toEqual([]);
    expect((await movimentos()).map((m) => [m.descricao, m.tipo])).toEqual([["Farmácia", "aporte"]]);
  });

  it("a entrada não tem categoria: o chip não aparece", async () => {
    await abrir();
    const item = screen.getByRole("listitem", { name: "Salário" });
    expect(within(item).queryByLabelText("Investimentos")).toBeNull();
  });

  it("no lote, escolher Investimentos aceita todas como aporte", async () => {
    await abrir();
    fireEvent.click(screen.getByLabelText(/Selecionar todas as saídas/));
    const painel = screen.getByRole("region", { name: "Aceitar em lote" });

    fireEvent.click(within(painel).getByRole("button",{name:"Aporte em investimento"}));
    expect(within(painel).getByLabelText("Investimento")).toBeTruthy();
    fireEvent.click(within(painel).getByRole("button", { name: "Aceitar 2 como aportes" }));

    expect(await screen.findByText("2 aportes registrados.")).toBeTruthy();
    expect(await gastos()).toEqual([]);
  });

  it("na divisão, a parte com Investimentos vira aporte com investimento e destinações", async () => {
    await abrir();
    const item = screen.getByRole("listitem", { name: "Farmácia" });
    const [investimento] = await chamar<Investimento[]>("/investimentos");

    fireEvent.click(within(item).getByRole("button", { name: "Dividir em partes" }));
    fireEvent.click(
      within(within(item).getByRole("radiogroup", { name: "Tipo da parte 1" })).getByLabelText("Aporte"),
    );
    // A parte de aporte não tem tags: a divisão dela é pelas destinações.
    expect(within(item).queryByLabelText(/Tags da parte 1/)).toBeNull();
    const destino = within(item).getByRole("group", { name: "Para onde vai a parte 1" });
    fireEvent.change(within(destino).getByLabelText("Investimento"), {
      target: { value: investimento.id },
    });
    fireEvent.change(within(destino).getByLabelText("Tag da destinação 1"), {
      target: { value: "Reserva" },
    });
    fireEvent.change(within(item).getByLabelText("Categoria da parte 2"), { target: { value: "lazer" } });
    fireEvent.change(within(item).getByLabelText("Percentual da parte 1"), { target: { value: "70" } });
    fireEvent.change(within(item).getByLabelText("Percentual da parte 2"), { target: { value: "30" } });
    fireEvent.click(within(item).getByRole("button", { name: /Salvar divisão/ }));

    expect(await screen.findByText("Transação dividida em 2 lançamentos.")).toBeTruthy();
    expect((await gastos()).map((g) => [g.descricao, g.valor, g.categoria])).toEqual([
      ["Farmácia (2/2)", "13.77", "lazer"],
    ]);
    const [depois] = await chamar<Investimento[]>("/investimentos");
    expect(depois.destinacoes.map((d) => [d.tag, d.principal])).toEqual([["reserva", "32.13"]]);
  });

  it("as destinações da parte de aporte precisam somar 100 antes de aceitar", async () => {
    await abrir();
    const item = screen.getByRole("listitem", { name: "Farmácia" });
    const [investimento] = await chamar<Investimento[]>("/investimentos");

    fireEvent.click(within(item).getByRole("button", { name: "Dividir em partes" }));
    fireEvent.click(
      within(within(item).getByRole("radiogroup", { name: "Tipo da parte 1" })).getByLabelText("Aporte"),
    );
    fireEvent.change(within(item).getByLabelText("Categoria da parte 2"), { target: { value: "lazer" } });
    const destino = within(item).getByRole("group", { name: "Para onde vai a parte 1" });
    fireEvent.change(within(destino).getByLabelText("Investimento"), {
      target: { value: investimento.id },
    });
    fireEvent.change(within(destino).getByLabelText("Tag da destinação 1"), { target: { value: "casa" } });
    fireEvent.change(within(destino).getByLabelText("Percentual da destinação 1"), {
      target: { value: "40" },
    });

    const aceitar = within(item).getByRole("button", { name: /Salvar divisão/ }) as HTMLButtonElement;
    expect(aceitar.disabled).toBe(true);
  });
});

describe("sugestão do investimento da emissão", () => {
  it("o cartão já abre em aporte, com o investimento escolhido e o texto da sugestão", async () => {
    const id = adicionarInvestimentoSimulado({
      nome: "Farmácia",
      tipo: "FIXED_INCOME",
      saldo: "46.00",
      valor_aplicado: "45.90",
    });
    await abrir();
    const item = screen.getByRole("listitem", { name: "Farmácia" });

    expect(await within(item).findByText("Parece o aporte de «Farmácia»")).toBeTruthy();
    expect((within(item).getByLabelText("Investimento") as HTMLSelectElement).value).toBe(id);
    expect(within(item).getByLabelText("Tag da destinação 1")).toBeTruthy();
    // As outras saídas continuam como gasto.
    const mercado = screen.getByRole("listitem", { name: "Mercado Extra" });
    expect(within(mercado).queryByText(/Parece o aporte/)).toBeNull();

    fireEvent.change(within(item).getByLabelText("Tag da destinação 1"), { target: { value: "casa" } });
    fireEvent.click(within(item).getByRole("button", { name: /Aceitar como aporte/ }));

    expect(await screen.findByText("Aporte registrado.")).toBeTruthy();
    const [depois] = (await chamar<Investimento[]>("/investimentos")).filter((i) => i.id === id);
    expect(depois.destinacoes.map((d) => [d.tag, d.principal])).toEqual([["casa", "45.90"]]);
  });

  it("depois de tratar o cartão anterior, o foco vai para as destinações do sugerido", async () => {
    adicionarInvestimentoSimulado({
      nome: "Farmácia",
      tipo: "FIXED_INCOME",
      saldo: "46.00",
      valor_aplicado: "45.90",
    });
    await abrir();
    const salario = screen.getByRole("listitem", { name: "Salário" });
    await within(screen.getByRole("listitem", { name: "Farmácia" })).findByText(/Parece o aporte/);

    fireEvent.click(within(salario).getByRole("button", { name: /^Ignorar/ }));

    await waitFor(() =>
      expect(document.activeElement?.getAttribute("aria-label")).toBe("Tag da destinação 1"),
    );
    expect(
      screen.getByRole("listitem", { name: "Farmácia" }).contains(document.activeElement),
    ).toBe(true);
  });
});
