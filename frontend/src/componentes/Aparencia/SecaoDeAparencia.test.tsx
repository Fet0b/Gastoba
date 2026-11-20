import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { aplicarAparencia } from "../../aparencia/aplicarAparencia";
import { chamar } from "../../api/cliente";
import type { Aparencia } from "../../api/tipos";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { SecaoDeAparencia } from "./SecaoDeAparencia";

const raiz = () => document.documentElement.style;
const SALVA: Aparencia = {
  matiz: 12,
  intensidade: "viva",
  textura: "pontos",
  nome: "Meu cofre",
  marca: "cofre",
  personalizada: true,
};

afterEach(() => aplicarAparencia(null));

async function montar(salva?: Aparencia, aoSalvar = vi.fn(), aoAvisar = vi.fn()) {
  entrarNaSimulacao();
  const resultado = render(<SecaoDeAparencia salva={salva} aoSalvar={aoSalvar} aoAvisar={aoAvisar} />);
  await screen.findByRole("form", { name: "Aparência do app" });
  return { ...resultado, aoSalvar, aoAvisar };
}

const botaoSalvar = () => screen.getByRole("button", { name: /Salvar aparência|Salvando/ }) as HTMLButtonElement;
const campoDoNome = () => screen.getByLabelText("Nome do app") as HTMLInputElement;

describe("SecaoDeAparencia", () => {
  it("começa sem mudança: salvar e cancelar desabilitados, com o texto do que falta", async () => {
    await montar();
    expect(botaoSalvar().disabled).toBe(true);
    expect(document.body.textContent).toContain("Mude alguma escolha para poder salvar.");
    expect((screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(campoDoNome().value).toBe("Gastoba");
  });

  it("cada mudança é uma prévia imediata nos tokens e no título", async () => {
    await montar();
    fireEvent.click(screen.getByRole("radio", { name: "Verde" }));
    expect(raiz().getPropertyValue("--cor-ametista")).toMatch(/^#/);
    fireEvent.click(screen.getByRole("radio", { name: "Grade" }));
    expect(raiz().getPropertyValue("--textura-da-pagina")).toContain("linear-gradient");
    fireEvent.change(campoDoNome(), { target: { value: "Meu app" } });
    expect(document.title).toBe("Meu app");
    expect(botaoSalvar().disabled).toBe(false);
  });

  it("Cancelar volta à aparência salva e limpa a prévia", async () => {
    await montar();
    fireEvent.click(screen.getByRole("radio", { name: "Verde" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(raiz().cssText).toBe("");
    expect((screen.getByRole("radio", { name: "Roxo" }) as HTMLInputElement).checked).toBe(true);
  });

  it("sair da tela com rascunho volta à aparência salva", async () => {
    const { unmount } = await montar(SALVA);
    const ametistaSalva = raiz().getPropertyValue("--cor-ametista");
    fireEvent.click(screen.getByRole("radio", { name: "Verde" }));
    expect(raiz().getPropertyValue("--cor-ametista")).not.toBe(ametistaSalva);
    unmount();
    expect(raiz().getPropertyValue("--cor-ametista")).toBe(ametistaSalva);
    expect(raiz().getPropertyValue("--cor-ametista")).not.toBe("");
  });

  it("salvar grava na API, entrega o resultado e avisa", async () => {
    const { aoSalvar, aoAvisar } = await montar();
    fireEvent.click(screen.getByRole("radio", { name: "Verde" }));
    fireEvent.click(screen.getByRole("radio", { name: "Cofre" }));
    fireEvent.change(campoDoNome(), { target: { value: "  Meu cofre " } });
    await act(async () => {
      fireEvent.click(botaoSalvar());
    });
    await waitFor(() => expect(aoSalvar).toHaveBeenCalled());
    const gravada = aoSalvar.mock.calls[0][0] as Aparencia;
    expect(gravada).toMatchObject({ matiz: 150, marca: "cofre", nome: "Meu cofre", personalizada: true });
    expect(aoAvisar).toHaveBeenCalledWith("confirmacao", "Aparência salva.");
  });

  it("nome vazio, só espaços ou com 21 caracteres bloqueia o salvamento com a explicação", async () => {
    await montar();
    for (const nome of ["", "   ", "x".repeat(21)]) {
      fireEvent.change(campoDoNome(), { target: { value: nome } });
      expect(botaoSalvar().disabled).toBe(true);
      expect(screen.getByRole("alert").textContent).toMatch(/nome do app/i);
      expect(document.body.textContent).toContain("Corrija o nome do app para poder salvar.");
    }
    expect(campoDoNome().getAttribute("aria-invalid")).toBe("true");
  });

  it("falha ao salvar sem resposta mantém a prévia e avisa", async () => {
    const { aoAvisar, aoSalvar } = await montar();
    fireEvent.click(screen.getByRole("radio", { name: "Verde" }));
    const ametista = raiz().getPropertyValue("--cor-ametista");
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("falhou"));
    try {
      await act(async () => {
        fireEvent.click(botaoSalvar());
      });
      await waitFor(() => expect(aoAvisar).toHaveBeenCalledWith("erro", expect.any(String)));
    } finally {
      globalThis.fetch = original;
    }
    expect(aoSalvar).not.toHaveBeenCalled();
    expect(raiz().getPropertyValue("--cor-ametista")).toBe(ametista);
    expect(botaoSalvar().disabled).toBe(false);
  });

  it("restaurar pede confirmação, devolve ao padrão e avisa", async () => {
    await chamar("/auth/eu").catch(() => undefined);
    const { aoSalvar, aoAvisar } = await montar(SALVA);
    fireEvent.click(screen.getByRole("button", { name: "Mais ações da aparência" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Restaurar a aparência padrão" }));
    const dialogo = document.querySelector("dialog[open]") as HTMLDialogElement;
    expect(dialogo.textContent).toContain("Restaurar a aparência padrão?");
    expect(document.activeElement?.textContent).toBe("Cancelar");
    expect(aoSalvar).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restaurar" }));
    });
    await waitFor(() => expect(aoSalvar).toHaveBeenCalledWith(undefined));
    expect(aoAvisar).toHaveBeenCalledWith("confirmacao", "Aparência padrão restaurada.");
  });

  it("restaurar e depois cancelar a confirmação não restaura nada", async () => {
    const { aoSalvar } = await montar(SALVA);
    fireEvent.click(screen.getByRole("button", { name: "Mais ações da aparência" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Restaurar a aparência padrão" }));
    const dialogo = document.querySelector("dialog[open]") as HTMLElement;
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(aoSalvar).not.toHaveBeenCalled();
    expect(campoDoNome().value).toBe("Meu cofre");
  });
});
