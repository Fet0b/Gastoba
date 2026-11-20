import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Categoria } from "../../api/tipos";
import type { LinhaDaDivisao } from "../../transacoes/divisao";
import { EditorDeDivisao, LINHAS_INICIAIS_DA_DIVISAO } from "./EditorDeDivisao";

const NBSP = "\u{a0}";
const CATEGORIAS: Categoria[] = [
  { codigo: "lazer", nome: "Lazer", legada: false },
  { codigo: "conforto", nome: "Conforto", legada: false },
];

function Editor({
  saida = true,
  aoSalvar = vi.fn(),
  inicial = LINHAS_INICIAIS_DA_DIVISAO,
}: {
  saida?: boolean;
  aoSalvar?: () => void;
  inicial?: readonly LinhaDaDivisao[];
}) {
  const [linhas, definir] = useState<LinhaDaDivisao[]>([...inicial]);
  return (
    <EditorDeDivisao
      categorias={CATEGORIAS}
      linhas={linhas}
      aoMudarLinhas={definir}
      valor="2789.30"
      saida={saida}
      podeSalvar={linhas.every((l) => l.categoria !== "" || !saida) && linhas.length > 1}
      salvando={false}
      nomeDoSalvar="Salvar divisão: Mercado"
      aoSalvar={aoSalvar}
      aoCancelar={vi.fn()}
      aoNaoDividir={vi.fn()}
    />
  );
}

/** O texto de todos os elementos do seletor (o getByText normaliza o NBSP, mas não o texto buscado). */
const textos = (seletor: string) => Array.from(document.querySelectorAll(seletor)).map((e) => e.textContent);

const percentual = (n: number) => screen.getByLabelText(`Percentual da parte ${n}`) as HTMLInputElement;
const categoria = (n: number) => screen.getByLabelText(`Categoria da parte ${n}`) as HTMLSelectElement;

describe("EditorDeDivisao", () => {
  it("abre com duas partes de 50% e o foco na primeira categoria vazia", () => {
    render(<Editor />);

    expect(percentual(1).value).toBe("50");
    expect(percentual(2).value).toBe("50");
    expect(document.activeElement).toBe(categoria(1));
    expect(textos("[data-equivalente]")).toEqual([`equivale a R$${NBSP}1.394,65`, `equivale a R$${NBSP}1.394,65`]);
  });

  it("o erro da categoria aparece junto ao campo só depois de sair dele", () => {
    render(<Editor />);

    expect(screen.queryByText("Escolha a categoria")).toBeNull();
    fireEvent.blur(categoria(2));
    expect(screen.getByText("Escolha a categoria")).toBeTruthy();
    expect(categoria(2).getAttribute("aria-invalid")).toBe("true");
    expect(categoria(1).getAttribute("aria-invalid")).toBeNull();
  });

  it("mostra a situação do rodapé: falta, passou e tudo distribuído, com o valor em reais", () => {
    render(<Editor />);
    expect(screen.getByText("Tudo distribuído")).toBeTruthy();
    expect(textos("[data-parte] ~ div .valor, .valor")).toContain(`R$${NBSP}2.789,30`);

    fireEvent.change(percentual(2), { target: { value: "40" } });
    expect(textos("[data-badge]")).toEqual([`Falta R$${NBSP}278,93`]);

    fireEvent.change(percentual(2), { target: { value: "60" } });
    expect(textos("[data-badge]")).toEqual([`Passou R$${NBSP}278,93`]);
    const faixa = screen.getByRole("img", { name: /^Distribuição:/ });
    expect(faixa.querySelectorAll("[data-segmento]")).toHaveLength(2);
  });

  it("'Completar com o restante' dá à parte em foco o que falta; 'Dividir igualmente' refaz tudo", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar parte" }));
    expect(percentual(3).value).toBe("");
    expect(document.activeElement).toBe(categoria(3));
    fireEvent.change(percentual(1), { target: { value: "30" } });
    fireEvent.change(percentual(2), { target: { value: "20" } });

    fireEvent.focus(percentual(3));
    fireEvent.click(screen.getByRole("button", { name: "Completar com o restante" }));
    expect(percentual(3).value).toBe("50");
    expect(screen.getByText("Tudo distribuído")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Completar com o restante" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Dividir igualmente" }));
    expect([percentual(1).value, percentual(2).value, percentual(3).value]).toEqual(["34", "33", "33"]);
  });

  it("em reais, converte para a porcentagem inteira mais próxima e mostra o que vale", () => {
    render(<Editor />);
    const grupo = screen.getByRole("radiogroup", { name: "Unidade da parte 1" });
    fireEvent.click(within(grupo).getByLabelText("Reais"));

    const campo = screen.getByLabelText("Valor da parte 1 em reais") as HTMLInputElement;
    expect(campo.value).toBe("1.394,65");
    fireEvent.change(campo, { target: { value: "100000" } });
    expect(campo.value).toBe("1.000,00");
    expect(textos("[data-equivalente]")[0]).toBe(`equivale a 36%, R$${NBSP}1.004,14`);
    fireEvent.click(within(grupo).getByLabelText("Porcentagem"));
    expect(percentual(1).value).toBe("36");
  });

  it("o menu da parte duplica (sem valor) e remove; remover fica desabilitado com 2 partes", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Mais ações da parte 1" }));
    expect((screen.getByRole("menuitem", { name: "Remover a parte 1" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicar a parte 1" }));

    expect(screen.getAllByRole("group", { name: /^Parte \d$/ })).toHaveLength(3);
    expect(percentual(2).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Mais ações da parte 2" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remover a parte 2" }));
    expect(screen.getAllByRole("group", { name: /^Parte \d$/ })).toHaveLength(2);
  });

  it("Enter em 'Adicionar parte' adiciona e leva o foco à nova parte", () => {
    render(<Editor />);
    const adicionar = screen.getByRole("button", { name: "Adicionar parte" });
    adicionar.focus();
    fireEvent.click(adicionar);
    expect(document.activeElement).toBe(categoria(3));
  });

  it("o tipo é um controle segmentado; o aporte troca as tags pelo investimento", () => {
    render(<Editor />);
    expect(screen.getByLabelText(/Tags da parte 1/)).toBeTruthy();
    const tipo = screen.getByRole("radiogroup", { name: "Tipo da parte 1" });
    expect((within(tipo).getByLabelText("Gasto") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(tipo).getByLabelText("Aporte"));
    expect(screen.queryByLabelText(/Tags da parte 1/)).toBeNull();
    expect(screen.getByRole("group", { name: "Para onde vai a parte 1" })).toBeTruthy();
  });

  it("na entrada não há tipo nem categoria; só o valor", () => {
    render(<Editor saida={false} />);
    expect(screen.queryByRole("radiogroup", { name: "Tipo da parte 1" })).toBeNull();
    expect(screen.queryByLabelText("Categoria da parte 1")).toBeNull();
    expect(document.activeElement).toBe(percentual(1));
  });

  it("salvar só habilita com a divisão pronta e chama aoSalvar", () => {
    const aoSalvar = vi.fn();
    render(<Editor aoSalvar={aoSalvar} />);
    const salvar = screen.getByRole("button", { name: "Salvar divisão: Mercado" }) as HTMLButtonElement;
    expect(salvar.disabled).toBe(true);

    fireEvent.change(categoria(1), { target: { value: "lazer" } });
    fireEvent.change(categoria(2), { target: { value: "conforto" } });
    expect(salvar.disabled).toBe(false);
    fireEvent.click(salvar);
    expect(aoSalvar).toHaveBeenCalledTimes(1);
  });
});
