import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../../api/cliente";
import type { Conta } from "../../api/tipos";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { ApelidoDaConta } from "./ApelidoDaConta";

beforeEach(() => {
  entrarNaSimulacao();
});

async function criarConta(nome: string): Promise<Conta> {
  return chamar<Conta>("/contas", { metodo: "POST", corpo: { nome, saldo_inicial: "0.00" } });
}

function abrir(conta: Conta, extras: { aoFechar?: () => void; aoAvisar?: (texto: string) => void } = {}) {
  return render(
    <ApelidoDaConta conta={conta} aberto aoFechar={extras.aoFechar ?? vi.fn()} aoAvisar={extras.aoAvisar ?? vi.fn()} />,
  );
}

const campo = () => screen.getByLabelText("Apelido") as HTMLInputElement;
const salvar = () => screen.getByRole("button", { name: "Salvar apelido" }) as HTMLButtonElement;

describe("ApelidoDaConta", () => {
  it("explica para que serve e começa com Salvar desabilitado, dizendo o que falta", async () => {
    abrir(await criarConta("Nubank"));
    expect(screen.getByRole("dialog", { name: "Dar apelido" })).toBeTruthy();
    expect(screen.getByText("O apelido aparece no lugar do nome da conta.")).toBeTruthy();
    expect(salvar().disabled).toBe(true);
    expect(screen.getByText("Escreva um apelido.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remover apelido" })).toBeNull();
  });

  it("mostra abaixo do título qual conta está sendo nomeada", async () => {
    abrir(await criarConta("Nubank"));
    const dialogo = screen.getByRole("dialog", { name: "Dar apelido" });
    expect(within(dialogo).getByText("Nubank").hasAttribute("data-rotulo")).toBe(true);
    expect(within(dialogo).getByText("Conta corrente")).toBeTruthy();
  });

  it("avisa, sem bloquear, quando o apelido é igual ao rótulo de outra conta", async () => {
    await criarConta("Nubank");
    const b = await criarConta("Beta");
    abrir(b);
    fireEvent.change(campo(), { target: { value: "  núbank " } });
    const aviso = await screen.findByText(
      "Outra conta já aparece como Nubank. Escolha um nome diferente para não confundir.",
    );
    expect(campo().getAttribute("aria-describedby")).toContain(aviso.id);
    expect(salvar().disabled).toBe(false);
    fireEvent.change(campo(), { target: { value: "Reserva" } });
    expect(
      screen.queryByText("Outra conta já aparece como Nubank. Escolha um nome diferente para não confundir."),
    ).toBeNull();
  });

  it("mais de 40 caracteres bloqueia o envio com a explicação", async () => {
    abrir(await criarConta("Nubank"));
    fireEvent.change(campo(), { target: { value: "a".repeat(41) } });
    expect(salvar().disabled).toBe(true);
    expect(screen.getByText("Use no máximo 40 caracteres.")).toBeTruthy();
    fireEvent.change(campo(), { target: { value: "a".repeat(40) } });
    expect(salvar().disabled).toBe(false);
  });

  it("salva o apelido, avisa e fecha; o rótulo da conta passa a ser o apelido", async () => {
    const conta = await criarConta("Nubank");
    const aoFechar = vi.fn();
    const aoAvisar = vi.fn();
    abrir(conta, { aoFechar, aoAvisar });
    fireEvent.change(campo(), { target: { value: "  Conta da casa " } });
    fireEvent.click(salvar());
    await waitFor(() => expect(aoAvisar).toHaveBeenCalledWith("Apelido salvo."));
    expect(aoFechar).toHaveBeenCalledOnce();
    const contas = await chamar<Conta[]>("/contas");
    expect(contas.find((c) => c.id === conta.id)?.rotulo).toBe("Conta da casa");
  });

  it("apelido repetido mostra o erro junto ao campo e não fecha", async () => {
    const a = await criarConta("Alfa");
    const b = await criarConta("Beta");
    await chamar(`/contas/${a.id}/apelido`, { metodo: "PUT", corpo: { apelido: "Casa" } });
    const aoFechar = vi.fn();
    abrir(b, { aoFechar });
    fireEvent.change(campo(), { target: { value: "Casa" } });
    fireEvent.click(salvar());
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toBe("Você já tem uma conta com esse apelido.");
    expect(campo().getAttribute("aria-describedby")).toContain(alerta.id);
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it("mudar o apelido parte do atual e só habilita Salvar com um texto diferente", async () => {
    const a = await criarConta("Alfa");
    const conta = await chamar<Conta>(`/contas/${a.id}/apelido`, { metodo: "PUT", corpo: { apelido: "Casa" } });
    abrir(conta);
    expect(screen.getByRole("dialog", { name: "Mudar apelido" })).toBeTruthy();
    expect(campo().value).toBe("Casa");
    expect(salvar().disabled).toBe(true);
    expect(screen.getByText("Mude o apelido para salvar.")).toBeTruthy();
    fireEvent.change(campo(), { target: { value: "Casa nova" } });
    expect(salvar().disabled).toBe(false);
  });

  it("remover o apelido pede confirmação em dois passos, com o foco em Cancelar", async () => {
    const a = await criarConta("Alfa");
    const conta = await chamar<Conta>(`/contas/${a.id}/apelido`, { metodo: "PUT", corpo: { apelido: "Casa" } });
    const aoAvisar = vi.fn();
    const aoFechar = vi.fn();
    abrir(conta, { aoAvisar, aoFechar });
    fireEvent.click(screen.getByRole("button", { name: "Remover apelido" }));
    const confirmacao = await screen.findByRole("dialog", { name: "Remover o apelido Casa?" });
    expect(within(confirmacao).getByText("A conta volta a aparecer com o nome original.")).toBeTruthy();
    expect(document.activeElement).toBe(within(confirmacao).getByRole("button", { name: "Cancelar" }));
    fireEvent.click(within(confirmacao).getByRole("button", { name: "Confirmar remoção" }));
    await waitFor(() => expect(aoAvisar).toHaveBeenCalledWith("Apelido removido."));
    expect(aoFechar).toHaveBeenCalledOnce();
    const contas = await chamar<Conta[]>("/contas");
    expect(contas.find((c) => c.id === a.id)?.apelido).toBeNull();
  });
});
