import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { formatar } from "../../dinheiro/dinheiro";
import { restanteDaDistribuicao } from "../../investimentos/destinacoes";
import { BarraDaDistribuicao } from "./BarraDaDistribuicao";

const L = (...pares: [string, string][]) => pares.map(([tag, percentual]) => ({ tag, percentual }));

function desenhar(linhas: ReturnType<typeof L>, valores: (string | null)[], valor?: string) {
  return render(
    <BarraDaDistribuicao
      linhas={linhas}
      valores={valores}
      cores={linhas.map((_, i) => `#00000${i}`)}
      restante={restanteDaDistribuicao(valor, linhas)}
    />,
  );
}
const segmentos = () => Array.from(document.querySelectorAll('[data-segmento=""]')) as HTMLElement[];
const legenda = () => document.querySelector('[aria-label="Legenda da distribuição"]') as HTMLElement;

describe("BarraDaDistribuicao", () => {
  it("segmentos proporcionais e legenda com valor", () => {
    desenhar(L(["casa", "60"], ["viagem", "40"]), ["600.00", "400.00"], "1000.00");
    expect(segmentos().map((s) => s.style.width)).toEqual(["60%", "40%"]);
    expect(document.querySelector('[data-segmento="a-distribuir"]')).toBeNull();
    const texto = legenda().textContent ?? "";
    expect(texto).toContain("Casa");
    expect(texto).toContain("60%");
    expect(texto).toContain(formatar("600.00"));
  });

  it("mostra A distribuir quando falta", () => {
    desenhar(L(["casa", "70"]), ["700.00"], "1000.00");
    const falta = document.querySelector('[data-segmento="a-distribuir"]') as HTMLElement;
    expect(falta.style.width).toBe("30%");
    expect(legenda().textContent).toContain("A distribuir");
    expect(legenda().textContent).toContain("30%");
  });

  it("com excesso, larguras proporcionais à soma", () => {
    desenhar(L(["a", "60"], ["b", "50"]), [null, null]);
    const [a, b] = segmentos().map((s) => parseFloat(s.style.width));
    expect(a).toBeCloseTo(54.5455, 3);
    expect(b).toBeCloseTo(45.4545, 3);
    expect(document.querySelector('[data-segmento="a-distribuir"]')).toBeNull();
  });

  it("tag vazia vira Destinação N e percentual inválido não gera segmento", () => {
    desenhar(L(["", "50"], ["x", "abc"]), [null, null]);
    expect(segmentos()).toHaveLength(1);
    expect(legenda().textContent).toContain("Destinação 1");
    expect(legenda().querySelectorAll("li")).toHaveLength(2); // a linha válida e "A distribuir"
  });

  it("aria-label da figura e sem R$ sem valores", () => {
    desenhar(L(["casa", "60"], ["viagem", "40"]), []);
    const img = document.querySelector('[role="img"]') as HTMLElement;
    expect(img.getAttribute("aria-label")?.startsWith("Distribuição: Casa 60%")).toBe(true);
    expect(img.getAttribute("aria-label")).not.toContain("R$");
    expect(legenda().textContent).not.toContain("R$");
  });

  it("sem separador ponto médio e sem foco", () => {
    desenhar(L(["casa", "60"], ["viagem", "40"]), ["600.00", "400.00"], "1000.00");
    expect(legenda().textContent).not.toContain("\u{b7}");
    expect(document.querySelectorAll("button, [tabindex]")).toHaveLength(0);
  });
});
