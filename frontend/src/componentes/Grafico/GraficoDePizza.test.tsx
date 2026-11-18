import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GraficoDePizza } from "./GraficoDePizza";

const entradas = [
  { chave: "casa", rotulo: "casa", valor: "300.00" },
  { chave: "viagem", rotulo: "viagem", valor: "100.00" },
  { chave: "sem", rotulo: "Sem destinação", valor: "0.00" },
];

function abrir() {
  return render(<GraficoDePizza titulo="Distribuição" entradas={entradas} total="400.00" chaveNeutra="sem" />);
}

describe("GraficoDePizza", () => {
  it("lista cada parte com valor e percentual em texto, sem as de valor zero", () => {
    abrir();

    const legenda = screen.getByRole("list", { name: "Distribuição" });
    const itens = within(legenda).getAllByRole("button");
    expect(itens.map((i) => i.textContent)).toEqual([
      expect.stringContaining("Casa"),
      expect.stringContaining("Viagem"),
    ]);
    expect(itens[0].textContent).toContain("75%");
    expect(itens[1].textContent).toContain("25%");
  });

  it("o foco ou o clique numa parte a destaca e mostra o valor dela no centro", () => {
    const { container } = abrir();
    const botao = screen.getByRole("button", { name: /viagem/ });

    expect(container.textContent).toContain("Total");
    fireEvent.focus(botao);

    expect(botao.getAttribute("data-destacada")).toBe("true");
    expect(container.querySelector("p[aria-hidden]")?.textContent).toContain("viagem");
    fireEvent.blur(botao);
    expect(container.querySelector("p[aria-hidden]")?.textContent).toContain("Total");
  });

  it("tem uma tabela equivalente e o desenho é decoração", () => {
    const { container } = abrir();

    const tabela = screen.getByRole("table", { hidden: true });
    expect(within(tabela).getAllByRole("row", { hidden: true })).toHaveLength(3);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("sem valor, explica em vez de desenhar", () => {
    render(<GraficoDePizza titulo="x" entradas={[]} total="0.00" />);
    expect(screen.getByText("Nada para mostrar na distribuição")).toBeTruthy();
  });

  describe("filtro das partes", () => {
    it("cada parte é um só botão com aria-pressed, e não há caixas de seleção", () => {
      abrir();

      expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
      const casa = screen.getByRole("button", { name: "Mostrar no gráfico: casa" });
      expect(casa.getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(casa);
      expect(casa.getAttribute("aria-pressed")).toBe("false");
      expect(casa.getAttribute("data-fora")).toBe("true");
      fireEvent.click(casa);
      expect(casa.getAttribute("aria-pressed")).toBe("true");
    });

    it("cada parte tem uma caixa que a tira do gráfico e refaz o total e os percentuais", () => {
      const { container } = abrir();

      fireEvent.click(screen.getByRole("button", { name: "Mostrar no gráfico: casa" }));

      const viagem = screen.getByRole("button", { name: /viagem/ });
      expect(viagem.textContent).toContain("100%");
      expect(container.querySelector("p[aria-hidden]")?.textContent).toContain("Selecionado");
      expect(container.querySelector("p[aria-hidden]")?.textContent).toContain("100,00");
      // A parte tirada continua na legenda, dita em texto, para poder voltar.
      expect(screen.getByRole("button", { name: /casa/ }).textContent).toContain("fora do gráfico");
      expect(container.querySelectorAll("path[data-fatia]")).toHaveLength(1);
    });

    it("a tabela equivalente só traz as partes que ficaram", () => {
      abrir();

      fireEvent.click(screen.getByRole("button", { name: "Mostrar no gráfico: casa" }));

      const tabela = screen.getByRole("table", { hidden: true });
      expect(within(tabela).getAllByRole("row", { hidden: true })).toHaveLength(2);
    });

    it("sem nenhuma parte marcada, avisa e 'Mostrar todas' traz tudo de volta", () => {
      const { container } = abrir();
      fireEvent.click(screen.getByRole("button", { name: "Mostrar no gráfico: casa" }));
      fireEvent.click(screen.getByRole("button", { name: "Mostrar no gráfico: viagem" }));

      expect(screen.getByText("Nenhuma parte selecionada.")).toBeTruthy();
      expect(container.querySelectorAll("path[data-fatia]")).toHaveLength(0);
      fireEvent.click(screen.getByRole("button", { name: "Mostrar todas" }));

      expect(screen.queryByText("Nenhuma parte selecionada.")).toBeNull();
      expect(container.querySelectorAll("path[data-fatia]")).toHaveLength(2);
      expect(screen.queryByRole("button", { name: "Mostrar todas" })).toBeNull();
    });

    it("as cores das partes não mudam quando uma sai", () => {
      const { container } = abrir();
      const corDaViagem = () =>
        container.querySelector<HTMLElement>("li:nth-child(2) [aria-hidden='true']")?.style.backgroundColor;
      const antes = corDaViagem();

      fireEvent.click(screen.getByRole("button", { name: "Mostrar no gráfico: casa" }));

      expect(corDaViagem()).toBe(antes);
    });

    it("voltar a marcar a parte a devolve ao gráfico", () => {
      const { container } = abrir();
      const botao = screen.getByRole("button", { name: "Mostrar no gráfico: casa" });

      fireEvent.click(botao);
      fireEvent.click(botao);

      expect(container.querySelectorAll("path[data-fatia]")).toHaveLength(2);
      expect(container.querySelector("p[aria-hidden]")?.textContent).toContain("Total");
    });
  });
});

it("usa a cor escolhida e pula essa cor na rotação automática",()=>{
 const {container}=render(<GraficoDePizza titulo="Cores escolhidas" entradas={[{chave:"celular",rotulo:"celular",valor:"100.00",cor:"#5BD6B0"},{chave:"viagem",rotulo:"viagem",valor:"100.00"}]} total="200.00"/>);
 expect([...container.querySelectorAll("path[fill]")].map(p=>p.getAttribute("fill"))).toEqual(["#5BD6B0","#8B5CF6"]);
 expect(screen.getByRole("button",{name:/celular/}).querySelector("span[style]")?.getAttribute("style")).toContain("91, 214, 176");
});

it("as partes além das quatro maiores ficam recolhidas sem mudar o gráfico",()=>{const {container}=render(<GraficoDePizza titulo="Distribuição" entradas={Array.from({length:6},(_,i)=>({chave:String(i),rotulo:`Parte ${i}`,valor:`${6-i}.00`}))} total="21.00"/>);const resumo=screen.getByText("+ 2 destinações");expect(resumo.closest("details")?.open).toBe(false);expect(container.querySelectorAll("path[data-fatia]")).toHaveLength(6);expect(container.querySelector("table")?.className).not.toBe("");});
