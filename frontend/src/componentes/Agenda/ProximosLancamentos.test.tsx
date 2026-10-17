import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Recorrencia } from "../../api/tipos";
import { ProximosLancamentos } from "./ProximosLancamentos";

const NBSP = "\u{a0}";
const MENOS = "\u{2212}";
const HOJE = "2026-06-10";

function rec(extra: Partial<Recorrencia> = {}): Recorrencia {
  return {
    id: "r1",
    tipo: "gasto",
    conta_id: "c1",
    valor: "100.00",
    descricao: "Aluguel",
    dia_do_mes: 20,
    inicio: "2026-01-01",
    fim: null,
    categoria: "gasto_fixo",
    tags: [],
    ativa: true,
    ...extra,
  };
}

function mostrar(recorrencias: Recorrencia[] | undefined, carregando = false) {
  const { container } = render(
    <ProximosLancamentos recorrencias={recorrencias} hoje={HOJE} carregando={carregando} />,
  );
  const lista = container.querySelector("ol");
  return { container, lista, itens: lista ? Array.from(lista.querySelectorAll("li")) : [] };
}

describe("ProximosLancamentos", () => {
  it("lista por data, com ganho e gasto em texto e com sinal", () => {
    const { lista, itens } = mostrar([
      rec({ id: "a", descricao: "Aluguel", dia_do_mes: 20 }),
      rec({ id: "b", descricao: "Salário", tipo: "ganho", valor: "5000.00", dia_do_mes: 15, categoria: null }),
    ]);

    expect(lista?.getAttribute("aria-label")).toBe("Próximos lançamentos");
    expect(itens.map((i) => i.textContent)).toEqual([
      expect.stringContaining("Salário"),
      expect.stringContaining("Aluguel"),
    ]);
    expect(itens[0].textContent).toContain("Ganho");
    expect(itens[0].textContent).toContain(`+R$${NBSP}5.000,00`);
    expect(itens[1].textContent).toContain("Gasto");
    expect(itens[1].textContent).toContain(`${MENOS}R$${NBSP}100,00`);
  });

  it("diz amanhã e daqui a N dias, e a data fica em <time>", () => {
    const { itens } = mostrar([
      rec({ id: "a", descricao: "Água", dia_do_mes: 11 }),
      rec({ id: "b", descricao: "Luz", dia_do_mes: 15 }),
    ]);

    expect(itens[0].textContent).toContain("amanhã");
    expect(itens[1].textContent).toContain("daqui a 5 dias");
    const tempo = itens[1].querySelector("time") as HTMLTimeElement;
    expect(tempo.getAttribute("datetime")).toBe("2026-06-15");
    expect(tempo.textContent).toMatch(/15 de junho/);
  });

  it("corta em 30 dias e avisa quando nada cai nesse prazo", () => {
    const { lista, container } = mostrar([rec({ dia_do_mes: 10, inicio: "2026-06-01", fim: null })]);
    // próxima ocorrência: 10/07, a 30 dias de 10/06: ainda entra
    expect(lista?.querySelectorAll("li").length).toBe(1);

    const { container: outro } = render(
      <ProximosLancamentos recorrencias={[rec({ dia_do_mes: 10, inicio: "2026-08-01" })]} hoje={HOJE} />,
    );
    expect(outro.querySelector("ol")).toBeNull();
    expect(outro.textContent).toContain("Nada nos próximos 30 dias");
    expect(container).toBeTruthy();
  });

  it("sem recorrências vigentes mostra o estado vazio", () => {
    const { container } = mostrar([rec({ ativa: false })]);

    expect(container.querySelector("ol")).toBeNull();
    expect(container.textContent).toContain("Nada agendado");
  });

  it("os itens não têm parada de Tab", () => {
    const { lista } = mostrar([rec({ dia_do_mes: 15 })]);

    expect(lista?.querySelectorAll("a, button, input, select, textarea, [tabindex]").length).toBe(0);
  });

  it("enquanto carrega, avisa em vez de mostrar o vazio", () => {
    const { container } = mostrar(undefined, true);

    expect(container.textContent).toContain("Carregando");
    expect(container.textContent).not.toContain("Nada agendado");
  });
});
