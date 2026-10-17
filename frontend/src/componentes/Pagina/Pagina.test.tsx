import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { periodoAtual, proximo, rotulo } from "../../periodo/periodo";
import { definirLayoutEstreito } from "../../testes/preparar";
import type { Navegacao } from "../Navegacao/telas";
import { Pagina } from "./Pagina";

function criar(): Navegacao {
  return { nomeDaPessoa: "Ana", tela: "inicio", aoIrPara: vi.fn(), aoSair: vi.fn() };
}

function montar(propriedades: Partial<Parameters<typeof Pagina>[0]> = {}) {
  return render(
    <Pagina
      navegacao={criar()}
      estadoDoOlho="normal"
      mensagem={null}
      aoDispensarMensagem={vi.fn()}
      {...propriedades}
    >
      <p>Conteúdo</p>
    </Pagina>,
  );
}

describe("Pagina", () => {
  it("renderiza o main com o conteúdo e a navegação", () => {
    montar();
    const principal = screen.getByRole("main");
    expect(within(principal).getByText("Conteúdo")).not.toBeNull();
    expect(screen.getByRole("navigation", { name: "Telas" })).not.toBeNull();
  });

  it("o link Pular para o conteúdo é o primeiro foco e aponta para o main", () => {
    const { container } = montar();
    const link = screen.getByRole("link", { name: "Pular para o conteúdo" });
    const primeiro = container.querySelector<HTMLElement>("a, button, input, [tabindex]");
    expect(primeiro).toBe(link);
    const principal = screen.getByRole("main");
    expect(link.getAttribute("href")).toBe(`#${principal.id}`);
    expect(principal.getAttribute("tabindex")).toBe("-1");
  });

  it("ativar o link leva o foco ao main", () => {
    montar();
    fireEvent.click(screen.getByRole("link", { name: "Pular para o conteúdo" }));
    expect(document.activeElement).toBe(screen.getByRole("main"));
  });

  it("mostra a mensagem na região aria-live do Aviso", () => {
    montar({ mensagem: { tipo: "confirmacao", texto: "Pronto." } });
    const texto = screen.getByText("Pronto.");
    expect(texto.closest("[aria-live]")?.getAttribute("aria-live")).toBe("polite");
  });

  it("sem controles não há seletor de mês nem Novo gasto", () => {
    montar();
    expect(screen.queryByRole("group", { name: "Período" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Novo gasto/ })).toBeNull();
  });

  it("os controles trazem o mês e trocar de mês chama aoMudarPeriodo", () => {
    const aoMudarPeriodo = vi.fn();
    const periodo = periodoAtual();
    montar({ controles: { periodo, aoMudarPeriodo } });
    const grupo = screen.getByRole("group", { name: "Período" });
    expect(within(grupo).getByText(rotulo(periodo)).getAttribute("aria-live")).toBe("polite");
    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    expect(aoMudarPeriodo).toHaveBeenCalledWith(proximo(periodo));
    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(aoMudarPeriodo).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: /Novo gasto/ })).toBeNull();
  });

  it("a virada de ano funciona nos dois sentidos", () => {
    const aoMudarPeriodo = vi.fn();
    const { rerender } = montar({ controles: { periodo: { ano: 2026, mes: 1 }, aoMudarPeriodo } });
    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(aoMudarPeriodo).toHaveBeenLastCalledWith({ ano: 2025, mes: 12 });

    rerender(
      <Pagina
        navegacao={criar()}
        estadoDoOlho="normal"
        mensagem={null}
        aoDispensarMensagem={vi.fn()}
        controles={{ periodo: { ano: 2026, mes: 12 }, aoMudarPeriodo }}
      >
        <p>Conteúdo</p>
      </Pagina>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    expect(aoMudarPeriodo).toHaveBeenLastCalledWith({ ano: 2027, mes: 1 });
  });

  it("o olho é decorativo e reflete o estado recebido", () => {
    const { container, rerender } = montar();
    const olho = container.querySelector("svg[data-estado]");
    expect(olho?.getAttribute("aria-hidden")).toBe("true");
    expect(olho?.getAttribute("role")).toBeNull();
    expect(olho?.getAttribute("data-estado")).toBe("normal");

    rerender(
      <Pagina navegacao={criar()} estadoDoOlho="erro" mensagem={null} aoDispensarMensagem={vi.fn()}>
        <p>Conteúdo</p>
      </Pagina>,
    );
    expect(container.querySelector("svg[data-estado]")?.getAttribute("data-estado")).toBe("erro");
  });

  it("Novo gasto só existe com aoNovoGasto, e há um só", () => {
    const aoNovoGasto = vi.fn();
    montar({ controles: { periodo: periodoAtual(), aoMudarPeriodo: vi.fn(), aoNovoGasto } });
    const botoes = screen.getAllByRole("button", { name: /Novo gasto/ });
    expect(botoes).toHaveLength(1);
    expect(botoes[0].getAttribute("aria-keyshortcuts")).toBe("N");
    fireEvent.click(botoes[0]);
    expect(aoNovoGasto).toHaveBeenCalledTimes(1);
  });

  it("no computador a marca fica na barra lateral: um só h1 Gastoba", () => {
    montar();
    const titulos = screen.getAllByRole("heading", { level: 1 });
    expect(titulos.map((t) => t.textContent)).toEqual(["Gastoba"]);
  });

  it("trocar de layout troca só a barra: o conteúdo não remonta nem perde o estado", () => {
    function Contador() {
      const [cliques, definirCliques] = useState(0);
      return (
        <button type="button" onClick={() => definirCliques((c) => c + 1)}>
          Cliques: {cliques}
        </button>
      );
    }
    render(
      <Pagina navegacao={criar()} estadoDoOlho="normal" mensagem={null} aoDispensarMensagem={vi.fn()}>
        <Contador />
      </Pagina>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cliques: 0" }));
    const principal = screen.getByRole("main");

    act(() => definirLayoutEstreito(true));
    expect(screen.getByRole("button", { name: "Mais" })).not.toBeNull();
    expect(screen.getByRole("main")).toBe(principal);
    expect(screen.getByRole("button", { name: "Cliques: 1" })).not.toBeNull();

    act(() => definirLayoutEstreito(false));
    expect(screen.getByRole("main")).toBe(principal);
    expect(screen.getByRole("button", { name: "Cliques: 1" })).not.toBeNull();
  });

  it("a ordem do DOM: barra lateral antes do main no computador, barra de abas depois no celular", () => {
    const { unmount } = montar();
    let nav = screen.getByRole("navigation", { name: "Telas" });
    let principal = screen.getByRole("main");
    expect(nav.compareDocumentPosition(principal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();

    definirLayoutEstreito(true);
    montar();
    nav = screen.getByRole("navigation", { name: "Telas" });
    principal = screen.getByRole("main");
    expect(nav.compareDocumentPosition(principal) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  describe("no celular", () => {
    it("usa a barra de abas e mantém um só h1 Gastoba", () => {
      definirLayoutEstreito(true);
      montar();
      expect(screen.getByRole("button", { name: "Mais" })).not.toBeNull();
      const titulos = screen.getAllByRole("heading", { level: 1 });
      expect(titulos.map((t) => t.textContent)).toEqual(["Gastoba"]);
    });

    it("Novo gasto continua um botão com o mesmo nome, só um", () => {
      definirLayoutEstreito(true);
      const aoNovoGasto = vi.fn();
      montar({ controles: { periodo: periodoAtual(), aoMudarPeriodo: vi.fn(), aoNovoGasto } });
      const botoes = screen.getAllByRole("button", { name: /Novo gasto/ });
      expect(botoes).toHaveLength(1);
      fireEvent.click(botoes[0]);
      expect(aoNovoGasto).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("group", { name: "Período" })).not.toBeNull();
    });
  });
});
