import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../../api/cliente";
import { useDestinacoesCadastradas, useInvestimentos } from "../../api/consultas";
import type { DestinacaoCadastrada } from "../../api/tipos";
import { resumirCaixinhas, type ResumoDaCaixinha } from "../../investimentos/caixinhas";
import { entrarNaSimulacao, fetchSimulado } from "../../simulacao/fetchSimulado";
import { AparenciaDaCaixinha } from "./AparenciaDaCaixinha";

// Consultas por papel em 15 rádios são lentas sob carga (suíte inteira em paralelo).
vi.setConfig({ testTimeout: 20000 });

beforeEach(() => entrarNaSimulacao());

async function criar(nome: string, extras: Record<string, unknown> = {}) {
  return chamar<DestinacaoCadastrada>("/destinacoes-cadastradas", { metodo: "POST", corpo: { nome, ...extras } });
}

/** Mostra o catálogo atual (para provar a invalidação) e abre o diálogo da caixinha pedida. */
function Harness({ nome }: { nome: string }) {
  const catalogo = useDestinacoesCadastradas();
  const investimentos = useInvestimentos();
  const [aberta, definirAberta] = useState(true);
  const resumo: ResumoDaCaixinha | undefined = resumirCaixinhas(catalogo.dados ?? [], investimentos.dados ?? []).find((c) => c.nome === nome);
  return (
    <>
      <button onClick={() => definirAberta(true)}>Abrir aparência</button>
      <p data-testid="atual">{resumo ? `${resumo.icone}|${resumo.cor ?? "automatica"}` : ""}</p>
      <AparenciaDaCaixinha caixinha={aberta && resumo ? resumo : null} aoFechar={() => definirAberta(false)} />
    </>
  );
}

const atual = () => screen.getByTestId("atual").textContent;
const grupo = (nome: "Ícone" | "Cor") => within(screen.getByRole("dialog")).getByRole("group", { name: nome });

async function abrir(nome = "viagem", extras: Record<string, unknown> = {}) {
  await criar(nome, extras);
  render(<Harness nome={nome} />);
  return screen.findByRole("dialog", { name: `Mudar ícone e cor de ${nome[0]!.toUpperCase()}${nome.slice(1)}` });
}

describe("AparenciaDaCaixinha", () => {
  it("lista os seis ícones e as oito cores com a Automática, e marca a escolha atual", async () => {
    await abrir("viagem", { cor: "coral", icone: "aviao" });

    expect(within(grupo("Ícone")).getAllByRole("radio")).toHaveLength(6);
    expect(within(grupo("Cor")).getAllByRole("radio")).toHaveLength(9);
    for (const rotulo of ["Avião", "Casa", "Carro", "Computador", "Cofre", "Exclamação"]) expect(within(grupo("Ícone")).getByLabelText(rotulo)).toBeTruthy();
    for (const rotulo of ["Automática", "Ametista", "Menta", "Orquídea", "Céu", "Âmbar", "Coral", "Glicínia", "Esmeralda"]) expect(within(grupo("Cor")).getByLabelText(rotulo)).toBeTruthy();
    expect((within(grupo("Ícone")).getByLabelText("Avião") as HTMLInputElement).checked).toBe(true);
    expect((within(grupo("Cor")).getByLabelText("Coral") as HTMLInputElement).checked).toBe(true);
  });

  it("Ícone vem antes de Cor", async () => {
    const dialogo = await abrir();

    expect([...dialogo.querySelectorAll("fieldset legend")].map((l) => l.firstChild?.textContent)).toEqual(["Ícone", "Cor"]);
  });

  it("sem escolha anterior marca o Cofre e a cor Automática", async () => {
    await abrir("viagem");

    expect((within(grupo("Ícone")).getByLabelText("Cofre") as HTMLInputElement).checked).toBe(true);
    expect((within(grupo("Cor")).getByLabelText("Automática") as HTMLInputElement).checked).toBe(true);
  });

  it("Salvar fica desabilitado, com o motivo escrito, até haver uma mudança", async () => {
    const dialogo = await abrir();
    const salvar = within(dialogo).getByRole("button", { name: "Salvar" }) as HTMLButtonElement;

    expect(salvar.disabled).toBe(true);
    expect(dialogo.textContent).toContain("Escolha outro ícone ou outra cor para salvar.");
    fireEvent.click(within(grupo("Ícone")).getByLabelText("Casa"));
    expect(salvar.disabled).toBe(false);
    expect(dialogo.textContent).not.toContain("Escolha outro ícone ou outra cor para salvar.");
  });

  it("Cancelar fecha sem gravar nada", async () => {
    const dialogo = await abrir();
    fireEvent.click(within(grupo("Ícone")).getByLabelText("Casa"));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(atual()).toBe("cofre|automatica"));
  });

  it("salva só o ícone, só a cor ou os dois; o catálogo é relido e o diálogo fecha", async () => {
    let dialogo = await abrir();
    fireEvent.click(within(grupo("Ícone")).getByLabelText("Carro"));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(atual()).toBe("carro|automatica"));

    fireEvent.click(screen.getByRole("button", { name: "Abrir aparência" }));
    dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(grupo("Cor")).getByLabelText("Céu"));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(atual()).toBe("carro|ceu"));

    fireEvent.click(screen.getByRole("button", { name: "Abrir aparência" }));
    dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(grupo("Ícone")).getByLabelText("Cofre"));
    fireEvent.click(within(grupo("Cor")).getByLabelText("Automática"));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(atual()).toBe("cofre|automatica"));
    const [criada] = await chamar<DestinacaoCadastrada[]>("/destinacoes-cadastradas");
    expect(criada).toMatchObject({ icone: null, cor: null });
  });

  it("erro ao salvar o ícone aparece junto ao grupo, o diálogo continua e a cor não é enviada", async () => {
    const cores = vi.fn();
    vi.stubGlobal("fetch", (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
      if (String(entrada).includes("/cores-das-destinacoes")) cores();
      if (opcoes?.method === "PUT" && String(entrada).endsWith("/icone")) {
        return Promise.resolve(new Response(JSON.stringify({ erro: { codigo: "icone_invalido", mensagem: "Escolha um dos ícones disponíveis para a caixinha." } }), { status: 422 }));
      }
      return fetchSimulado(entrada, opcoes);
    });
    const dialogo = await abrir();
    fireEvent.click(within(grupo("Ícone")).getByLabelText("Casa"));
    fireEvent.click(within(grupo("Cor")).getByLabelText("Coral"));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salvar" }));

    const alerta = await within(dialogo).findByRole("alert");
    expect(alerta.textContent).toContain("Escolha um dos ícones");
    expect(grupo("Ícone").parentElement?.contains(alerta)).toBe(true);
    expect(cores).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((within(grupo("Cor")).getByLabelText("Coral") as HTMLInputElement).checked).toBe(true);
  });

  it("se a cor falha depois de o ícone gravar, o ícone fica salvo e o erro aparece junto à cor", async () => {
    vi.stubGlobal("fetch", (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
      if (opcoes?.method === "PUT" && String(entrada).includes("/cores-das-destinacoes")) {
        return Promise.resolve(new Response(JSON.stringify({ erro: { codigo: "temporario", mensagem: "Tente novamente." } }), { status: 503 }));
      }
      return fetchSimulado(entrada, opcoes);
    });
    const dialogo = await abrir();
    fireEvent.click(within(grupo("Ícone")).getByLabelText("Casa"));
    fireEvent.click(within(grupo("Cor")).getByLabelText("Coral"));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salvar" }));

    const alerta = await within(dialogo).findByRole("alert");
    expect(alerta.textContent).toContain("Tente novamente.");
    expect(grupo("Cor").parentElement?.contains(alerta)).toBe(true);
    await waitFor(() => expect(atual()).toBe("casa|automatica"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("devolve o foco ao botão que abriu o diálogo ao fechar", async () => {
    await criar("viagem");
    render(<Harness nome="viagem" />);
    const gatilho = screen.getByRole("button", { name: "Abrir aparência" });
    gatilho.focus();
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(document.activeElement).toBe(gatilho));
  });

  it("o diálogo da outra caixinha começa pela escolha dela, não pela anterior", async () => {
    await criar("viagem", { icone: "aviao" });
    await criar("casa", { icone: "casa" });
    const { rerender } = render(<AparenciaDaCaixinha caixinha={{ id: "1", nome: "viagem", icone: "aviao", cor: null, valor: "0.00", rendimento: "0.00", partes: [] }} aoFechar={vi.fn()} />);
    expect((within(grupo("Ícone")).getByLabelText("Avião") as HTMLInputElement).checked).toBe(true);
    rerender(<AparenciaDaCaixinha caixinha={{ id: "2", nome: "casa", icone: "casa", cor: "ceu", valor: "0.00", rendimento: "0.00", partes: [] }} aoFechar={vi.fn()} />);

    expect((within(grupo("Ícone")).getByLabelText("Casa") as HTMLInputElement).checked).toBe(true);
    expect((within(grupo("Cor")).getByLabelText("Céu") as HTMLInputElement).checked).toBe(true);
  });
});

describe("AparenciaDaCaixinha: escolha visível", () => {
  it("mostra ao lado da legenda o nome do escolhido e o acompanha ao mudar, sem mudar o nome do grupo", async () => {
    const dialogo = await abrir("viagem", { cor: "menta", icone: "casa" });
    const legendaDoIcone = grupo("Ícone").querySelector("legend") as HTMLElement;
    const legendaDaCor = grupo("Cor").querySelector("legend") as HTMLElement;

    expect(legendaDoIcone.textContent).toBe("Ícone: Casa");
    expect(legendaDaCor.textContent).toBe("Cor: Menta");
    fireEvent.click(within(dialogo).getByLabelText("Carro"));
    expect(legendaDoIcone.textContent).toBe("Ícone: Carro");
    expect(within(dialogo).getByRole("group", { name: "Ícone" })).toBeTruthy();
  });

  it("marca a opção escolhida também com o ícone de verificado, só nela", async () => {
    const dialogo = await abrir("viagem", { icone: "casa" });
    const marcadas = dialogo.querySelectorAll("fieldset [data-selo]");

    expect(marcadas).toHaveLength(2);
    expect(within(grupo("Ícone")).getByLabelText("Casa").closest("label")?.querySelector("[data-selo]")).toBeTruthy();
    expect(within(grupo("Ícone")).getByLabelText("Carro").closest("label")?.querySelector("[data-selo]")).toBeNull();
  });
});
