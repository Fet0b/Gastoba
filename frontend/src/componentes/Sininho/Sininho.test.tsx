import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { chamar } from "../../api/cliente";
import { invalidar } from "../../api/useConsulta";
import { adicionarInvestimentoSimulado, prepararCenarioDeCaixinha } from "../../simulacao/manipuladores";
import { Sininho } from "./Sininho";

const NBSP = "\u{a0}";

describe("Sininho", () => {
  it("sem saque sem tag mostra o sino apagado e nenhum contador", async () => {
    prepararCenarioDeCaixinha();
    const { container } = render(<Sininho aoVerResgate={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Avisos: nenhum" })).toBeTruthy());
    expect(container.querySelector("[data-contador]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Avisos: nenhum" }));
    expect(screen.getByText("Nenhum aviso por enquanto.")).toBeTruthy();
  });

  it("com saque sem tag acende o contador e lista data, valor e descrição", async () => {
    prepararCenarioDeCaixinha({ semTag: true });
    const { container } = render(<Sininho aoVerResgate={vi.fn()} />);
    const botao = await screen.findByRole("button", { name: "Avisos: 1 resgate sem caixinha" });
    expect(container.querySelector("[data-contador]")?.textContent).toBe("1");
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(botao);
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByRole("button", { name: new RegExp(`R\\$${NBSP}100,00.*06/11/2026.*Saque fictício`) }),
    ).toBeTruthy();
    // O anúncio fica numa região de status, sem roubar o foco.
    expect(screen.getByRole("status").textContent).toBe("Avisos: 1 resgate sem caixinha");
    expect(document.activeElement).not.toBe(screen.getByRole("status"));
  });

  it("escolher um aviso leva ao resgate e fecha a lista; Esc fecha e devolve o foco", async () => {
    prepararCenarioDeCaixinha({ semTag: true });
    const aoVerResgate = vi.fn();
    render(<Sininho aoVerResgate={aoVerResgate} />);
    const botao = await screen.findByRole("button", { name: /^Avisos: 1/ });
    fireEvent.click(botao);
    fireEvent.click(screen.getByRole("button", { name: /Saque fictício/ }));
    expect(aoVerResgate).toHaveBeenCalledTimes(1);
    expect(botao.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(botao);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(botao);
  });

  it("o aviso some quando o resgate recebe tag", async () => {
    const { semTagId, investimentoId } = prepararCenarioDeCaixinha({ semTag: true });
    render(<Sininho aoVerResgate={vi.fn()} />);
    await screen.findByRole("button", { name: /^Avisos: 1/ });
    await chamar(`/movimentos-de-investimento/${semTagId}/destinacoes`, {
      metodo: "POST",
      corpo: { investimento_id: investimentoId, destinacoes: [{ tag: "reserva", percentual: 100 }] },
    });
    invalidar("resgates-sem-destinacao");
    await waitFor(() => expect(screen.getByRole("button", { name: "Avisos: nenhum" })).toBeTruthy());
  });
});

it("o vencimento confirmado de posição sem caixinhas sai do sino; o resgate sem marca continua", async () => {
  const { semTagId } = prepararCenarioDeCaixinha({ semTag: true });
  const cdb = adicionarInvestimentoSimulado({ nome: "CDB sem caixinhas", tipo: "FIXED_INCOME", saldo: "100.00" });
  await chamar(`/movimentos-de-investimento/${semTagId}/destinacoes`, {
    metodo: "POST",
    corpo: { investimento_id: cdb, destinacoes: [] },
  });
  render(<Sininho aoVerResgate={vi.fn()} />);
  await screen.findByRole("button", { name: /^Avisos: 1/ });
  await chamar(`/movimentos-de-investimento/${semTagId}/natureza-do-resgate`, {
    metodo: "PUT",
    corpo: { tipo: "vencimento" },
  });
  invalidar("resgates-sem-destinacao");
  await waitFor(() => expect(screen.getByRole("button", { name: "Avisos: nenhum" })).toBeTruthy());
});

it("resgate já ligado a posição sem caixinhas pede só a natureza, não a destinação", async () => {
  const { semTagId } = prepararCenarioDeCaixinha({ semTag: true });
  const cdb = adicionarInvestimentoSimulado({ nome: "CDB sem caixinhas", tipo: "FIXED_INCOME", saldo: "100.00" });
  await chamar(`/movimentos-de-investimento/${semTagId}/destinacoes`, {
    metodo: "POST",
    corpo: { investimento_id: cdb, destinacoes: [] },
  });
  render(<Sininho aoVerResgate={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /^Avisos: 1/ }));
  expect(screen.getByRole("button", { name: /Confirmar natureza/ })).toBeTruthy();
  expect(screen.queryByText(/Definir destinação/)).toBeNull();
  expect(screen.getByText(/não há destinação a definir/)).toBeTruthy();
});

it("usa a classificação explícita e pluraliza vencimentos sem caixinha", async () => {
 vi.stubGlobal("fetch", async () => new Response(JSON.stringify([
  {id:"v1",tipo:"vencimento",valor:"120.00",data:"2026-10-26",investimento_nome:"CDB Guanabara",descricao:"Entrada"},
  {id:"v2",tipo:"vencimento",valor:"80.00",data:"2026-10-27",investimento_nome:"CDB fictício",descricao:"Entrada"},
 ])));
 const abrir = vi.fn();
 render(<Sininho aoVerResgate={abrir} />);
 fireEvent.click(await screen.findByRole("button", {name:"Avisos: 2 vencimentos sem caixinha"}));
 const entrada = screen.getByRole("button", {name:/120,00.*venceu em 26\/10\/2026.*CDB Guanabara.*Definir destinação/});
 fireEvent.click(entrada);
 expect(abrir).toHaveBeenCalledWith("2026-10-26");
});
