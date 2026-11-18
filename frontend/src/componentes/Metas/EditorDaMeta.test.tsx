import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Categoria } from "../../api/tipos";
import { EditorDaMeta, lerPercentual } from "./EditorDaMeta";

const NBSP = "\u{a0}";
const lazer: Categoria = { codigo: "lazer", nome: "Lazer", legada: false };

describe("lerPercentual", () => {
  it.each([
    ["1", 1],
    ["30", 30],
    [" 100 ", 100],
    ["0", null],
    ["101", null],
    ["", null],
    ["2.5", null],
    ["-3", null],
    ["abc", null],
  ])("%j -> %j", (texto, esperado) => {
    expect(lerPercentual(texto)).toBe(esperado);
  });
});

describe("EditorDaMeta", () => {
  function renderizar(sobras: Partial<Parameters<typeof EditorDaMeta>[0]> = {}) {
    const props = {
      categoria: lazer,
      percentual: undefined as number | undefined,
      renda: "5000.00",
      somaDasOutras: 60,
      aoSalvar: vi.fn(async () => {}),
      salvando: false,
      ...sobras,
    };
    const resultado = render(<EditorDaMeta {...props} />);
    return { props, ...resultado };
  }

  const campo = () => screen.getByLabelText("Percentual da renda para Lazer") as HTMLInputElement;
  const salvar = () => screen.queryByRole("button", { name: "Salvar meta" }) as HTMLButtonElement | null;

  it("mostra o campo e o deslizante, sincronizados, e quanto o percentual vale no mês", () => {
    renderizar({ somaDasOutras: 20 });

    fireEvent.change(campo(), { target: { value: "30" } });
    expect(screen.getByText(/30% equivale a/).textContent).toContain(`R$${NBSP}1.500,00`);
    const deslizante = screen.getByLabelText("Ajustar o percentual de Lazer") as HTMLInputElement;
    expect(deslizante.value).toBe("30");

    fireEvent.change(deslizante, { target: { value: "25" } });
    expect(campo().value).toBe("25");
    expect(screen.getByText(/25% equivale a/).textContent).toContain(`R$${NBSP}1.250,00`);
  });

  it("começa com o percentual da meta e sem botão; Salvar meta só aparece quando o texto muda", () => {
    renderizar({ percentual: 15 });

    expect(campo().value).toBe("15");
    expect(salvar()).toBeNull();
    fireEvent.change(campo(), { target: { value: "16" } });
    expect(salvar()?.disabled).toBe(false);
    fireEvent.change(campo(), { target: { value: "15" } });
    expect(salvar()).toBeNull();
  });

  it("Salvar meta é o botão primário", () => {
    renderizar();
    fireEvent.change(campo(), { target: { value: "10" } });
    expect(salvar()?.getAttribute("data-papel")).toBe("principal");
  });

  it("soma acima de 100% avisa em alerta e não deixa salvar", () => {
    const { props } = renderizar({ somaDasOutras: 80 });

    fireEvent.change(campo(), { target: { value: "30" } });

    expect(screen.getByRole("alert").textContent).toBe("A soma das metas está em 110%: passa de 100% da renda.");
    expect(salvar()?.disabled).toBe(true);
    expect(campo().getAttribute("aria-invalid")).toBe("true");
    fireEvent.submit(campo().closest("form") as HTMLFormElement);
    expect(props.aoSalvar).not.toHaveBeenCalled();
  });

  it("exatamente 100% pode salvar, e salvar envia o número", async () => {
    const { props } = renderizar({ somaDasOutras: 70 });

    fireEvent.change(campo(), { target: { value: "30" } });
    fireEvent.click(salvar() as HTMLButtonElement);

    await waitFor(() => expect(props.aoSalvar).toHaveBeenCalledWith(30));
  });

  it("Enter no campo (envio do formulário) salva", async () => {
    const { props } = renderizar();

    fireEvent.change(campo(), { target: { value: "12" } });
    fireEvent.submit(campo().closest("form") as HTMLFormElement);

    await waitFor(() => expect(props.aoSalvar).toHaveBeenCalledWith(12));
  });

  it.each(["0", "101", "2,5", "abc"])("percentual %j desabilita o botão", (texto) => {
    renderizar();

    fireEvent.change(campo(), { target: { value: texto } });

    expect(salvar()?.disabled).toBe(true);
  });

  it("mostra o erro da API junto ao campo", () => {
    renderizar({ erro: "As metas somariam 120% da renda; o máximo é 100%." });

    expect(screen.getByText("As metas somariam 120% da renda; o máximo é 100%.")).toBeTruthy();
    expect(campo().getAttribute("aria-describedby")).toBeTruthy();
  });

  it("depois de salvar, o foco fica no campo (o botão some)", async () => {
    const { rerender, props } = renderizar();

    fireEvent.change(campo(), { target: { value: "10" } });
    fireEvent.click(salvar() as HTMLButtonElement);
    await waitFor(() => expect(props.aoSalvar).toHaveBeenCalled());
    rerender(<EditorDaMeta {...props} percentual={10} />);

    await waitFor(() => expect(document.activeElement).toBe(campo()));
    expect(salvar()).toBeNull();
  });

  it("remover a meta (percentual volta a indefinido) limpa o campo", () => {
    const { rerender, props } = renderizar({ percentual: 20 });
    expect(campo().value).toBe("20");

    rerender(<EditorDaMeta {...props} percentual={undefined} />);

    expect(campo().value).toBe("");
  });
});
