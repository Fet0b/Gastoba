import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ResumoDaCaixinha } from "../../investimentos/caixinhas";
import { HEX_DA_COR } from "../../investimentos/cores";
import { CartaoDaCaixinha } from "./CartaoDaCaixinha";

const PARTE = { investimentoId: "a", nomeDoInvestimento: "CDB", valor: "1.00", rendimento: "0.00" };

function resumo(extras: Partial<ResumoDaCaixinha> = {}): ResumoDaCaixinha {
  return { id: "1", nome: "viagem", icone: "aviao", cor: "coral", valor: "1234.50", rendimento: "12.30", partes: [PARTE], ...extras };
}

function montar(r: ResumoDaCaixinha, aberto = false) {
  const funcoes = { aoAlternar: vi.fn(), aoMudarAparencia: vi.fn(), aoExcluir: vi.fn() };
  const { container } = render(<CartaoDaCaixinha resumo={r} aberto={aberto} idDoPainel="painel" {...funcoes} />);
  return { ...funcoes, container };
}

describe("CartaoDaCaixinha", () => {
  it("mostra o nome com a primeira letra maiúscula, o valor e o rendimento com sinal", () => {
    montar(resumo());
    const botao = screen.getByRole("button", { name: /^Viagem/ });

    expect(botao.textContent).toContain("Viagem");
    expect(botao.textContent).toContain("R$\u{00A0}1.234,50");
    expect(botao.textContent).toContain("+R$\u{00A0}12,30");
  });

  it.each([
    ["12.30", "positivo", "+R$\u{00A0}12,30"],
    ["-4.00", "negativo", "\u{2212}R$\u{00A0}4,00"],
    ["0.00", "neutro", "R$\u{00A0}0,00"],
  ])("rendimento %s tem o tom %s e o texto %s, nunca só a cor", (rendimento, tom, texto) => {
    const { container } = montar(resumo({ rendimento }));
    const elemento = container.querySelector("[data-parte='rendimento']") as HTMLElement;

    expect(elemento.getAttribute("data-tom")).toBe(tom);
    expect(elemento.textContent).toContain(texto);
  });

  it("sem nenhuma parte em posição: o valor aparece uma vez e o rendimento vira 'Sem investimentos'", () => {
    const { container } = montar(resumo({ valor: "0.00", rendimento: "0.00", partes: [] }));
    const rendimento = container.querySelector("[data-parte='rendimento']") as HTMLElement;

    expect(rendimento.textContent).toBe("Sem investimentos");
    expect(rendimento.getAttribute("data-tom")).toBe("neutro");
    expect(container.textContent?.match(/R\$/g)).toHaveLength(1);
  });

  it("o menu fica no nome do cartão, ao lado do botão que o cobre", () => {
    const { container } = montar(resumo());

    expect(container.querySelector("[data-parte='menu']")).toBeTruthy();
    expect(container.querySelector("button button")).toBeNull();
  });

  it("usa a cor da caixinha na amostra do ícone e a cor automática (da paleta) sem escolha", () => {
    const { container } = montar(resumo({ cor: "ceu" }));
    expect((container.querySelector("[data-parte='icone']") as HTMLElement).style.backgroundColor).not.toBe("");
    expect((container.querySelector("[data-parte='icone']") as HTMLElement).getAttribute("data-cor")).toBe("ceu");
    expect(HEX_DA_COR.ceu).toBeDefined();

    const outro = montar(resumo({ cor: null })).container.querySelectorAll("[data-parte='icone']");
    expect(outro.length).toBeGreaterThan(0);
  });

  it("é um botão que alterna o painel: aria-expanded e aria-controls", () => {
    const { aoAlternar } = montar(resumo(), true);
    const botao = screen.getByRole("button", { name: /^Viagem/ });

    expect(botao.getAttribute("aria-expanded")).toBe("true");
    expect(botao.getAttribute("aria-controls")).toBe("painel");
    fireEvent.click(botao);
    expect(aoAlternar).toHaveBeenCalledTimes(1);
  });

  it("fechado, aria-expanded é false", () => {
    montar(resumo(), false);

    expect(screen.getByRole("button", { name: /^Viagem/ }).getAttribute("aria-expanded")).toBe("false");
  });

  it("o menu Mais ações oferece Mudar ícone e cor e Excluir caixinha", () => {
    const { aoMudarAparencia, aoExcluir } = montar(resumo());
    fireEvent.click(screen.getByRole("button", { name: "Mais ações de viagem" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mudar ícone e cor" }));
    expect(aoMudarAparencia).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Mais ações de viagem" }));
    const excluir = screen.getByRole("menuitem", { name: "Excluir caixinha" });
    fireEvent.click(excluir);
    expect(aoExcluir).toHaveBeenCalledTimes(1);
  });

  it("corta o nome longo com reticências e guarda o inteiro no title", () => {
    const longo = "a".repeat(30);
    const { container } = montar(resumo({ nome: longo }));

    const nome = container.querySelector("[data-parte='nome']") as HTMLElement;
    expect(nome.getAttribute("title")).toBe(longo);
    expect(within(container).getByRole("button", { name: `Mais ações de ${longo}` })).toBeTruthy();
  });

  it("o botão do menu não fica dentro do botão do cartão", () => {
    const { container } = montar(resumo());

    expect(container.querySelector("button button")).toBeNull();
  });
});
