import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Gasto, ResumoPorTags } from "../../api/tipos";
import { deCentavos, paraCentavos } from "../../dinheiro/dinheiro";
import { definirMidia } from "../../testes/preparar";
import { GraficoDeBarras } from "./GraficoDeBarras";

const NBSP = "\u{a0}";

function resumo(...pares: [string | null, string][]): ResumoPorTags {
  const centavos = pares.reduce((t, [, v]) => t + paraCentavos(v), 0n);
  return {
    inicio: "2026-06-01",
    fim: "2026-06-30",
    total: deCentavos(centavos),
    fatias: pares.map(([tag, valor]) => ({ tag, valor })),
  };
}

function gasto(id: string, valor: string, tags: string[]): Gasto {
  return {
    id,
    conta_id: "c1",
    valor,
    descricao: `Gasto ${id}`,
    data: "2026-06-10",
    categoria: "lazer",
    tags,
    origem: "manual",
    recorrencia_id: null,
  };
}

function Controlado({
  dados,
  gastos,
  aoSelecionar,
  inicial = null,
}: {
  dados: ResumoPorTags | undefined;
  gastos?: Gasto[];
  aoSelecionar?: (chave: string | null) => void;
  inicial?: string | null;
}) {
  const [selecionada, definir] = useState<string | null>(inicial);
  return (
    <GraficoDeBarras
      resumo={dados}
      carregando={false}
      gastos={gastos}
      selecionada={selecionada}
      aoSelecionar={(chave) => {
        aoSelecionar?.(chave);
        definir(chave);
      }}
    />
  );
}

const BASE = resumo(["mercado", "120.00"], ["pix", "60.00"], [null, "20.00"]);
const GASTOS = [
  ...Array.from({ length: 7 }, (_, i) => gasto(`m${i}`, "17.00", ["mercado"])),
  gasto("p1", "60.00", ["pix"]),
  gasto("s1", "20.00", []),
];

function botoes(): HTMLButtonElement[] {
  return linhasDaLista().flatMap((li) => Array.from(li.querySelectorAll<HTMLButtonElement>(":scope > button")));
}
function linhasDaLista(): HTMLElement[] {
  const lista = screen.getByRole("list", { name: "Gastos por tag" });
  return Array.from(lista.querySelectorAll<HTMLElement>(":scope > li"));
}

describe("GraficoDeBarras", () => {
  it("desenha uma linha por barra, em ordem de valor, com 'Sem tag' por último e a marca em texto", () => {
    render(<Controlado dados={BASE} gastos={GASTOS} />);

    const linhas = linhasDaLista();
    expect(linhas).toHaveLength(3);
    expect(linhas[0].textContent).toContain("mercado");
    expect(linhas[1].textContent).toContain("pix");
    expect(linhas[2].textContent).toContain("(sem tag)");
  });

  it("cada barra é um botão com o nome completo", () => {
    render(<Controlado dados={BASE} gastos={GASTOS} />);

    expect(
      screen.getByRole("button", { name: `mercado: R$${NBSP}120,00, 60% do total, 7 gastos` }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: `pix: R$${NBSP}60,00, 30% do total, 1 gasto` })).toBeTruthy();
    expect(screen.getByRole("button", { name: `Sem tag: R$${NBSP}20,00, 10% do total, 1 gasto` })).toBeTruthy();
  });

  it("sem a lista de gastos, o nome não traz a contagem", () => {
    render(<Controlado dados={BASE} />);

    expect(screen.getByRole("button", { name: `mercado: R$${NBSP}120,00, 60% do total` })).toBeTruthy();
  });

  it("a largura é proporcional à maior barra, e barras empatadas têm a mesma largura", () => {
    render(<Controlado dados={resumo(["a", "10.00"], ["b", "10.00"], ["c", "5.00"])} />);

    const fracoes = botoes().map((b) => b.querySelector("[data-fracao]")?.getAttribute("data-fracao"));
    expect(fracoes).toEqual(["1", "1", "0.5"]);
  });

  it("mostra '<1%' e dá o piso à tag minúscula", () => {
    render(<Controlado dados={resumo(["a", "1000.00"], ["b", "1.00"])} />);

    const botao = screen.getByRole("button", { name: new RegExp("^b: .*<1% do total") });
    expect(botao.querySelector("[data-fracao]")?.getAttribute("data-fracao")).toBe("0.01");
  });

  it("clicar marca a barra, chama aoSelecionar e clicar de novo desmarca", () => {
    const aoSelecionar = vi.fn();
    render(<Controlado dados={BASE} gastos={GASTOS} aoSelecionar={aoSelecionar} />);
    const [mercado, pix] = botoes();

    fireEvent.click(mercado);

    expect(aoSelecionar).toHaveBeenLastCalledWith("mercado");
    expect(mercado.getAttribute("aria-pressed")).toBe("true");
    expect(mercado.closest("li")?.getAttribute("data-selecionada")).toBe("true");
    expect(pix.getAttribute("aria-pressed")).toBe("false");
    expect(pix.closest("li")?.getAttribute("data-esmaecida")).toBe("true");

    fireEvent.click(mercado);

    expect(aoSelecionar).toHaveBeenLastCalledWith(null);
    expect(mercado.getAttribute("aria-pressed")).toBe("false");
    expect(pix.closest("li")?.getAttribute("data-esmaecida")).toBe("false");
  });

  it("'Esc' desfaz a tag fixada", () => {
    const aoSelecionar = vi.fn();
    render(<Controlado dados={BASE} aoSelecionar={aoSelecionar} inicial="pix" />);

    fireEvent.keyDown(botoes()[1], { key: "Escape" });

    expect(aoSelecionar).toHaveBeenLastCalledWith(null);
    expect(botoes()[1].getAttribute("aria-pressed")).toBe("false");
  });

  it("a dica aparece ao focar, some ao desfocar e com 'Esc'", () => {
    render(<Controlado dados={BASE} gastos={GASTOS} />);
    const [mercado] = botoes();
    const dica = () => document.querySelector("[data-dica]");

    expect(dica()).toBeNull();
    fireEvent.focus(mercado);
    expect(dica()?.textContent).toContain(`R$${NBSP}120,00`);
    expect(dica()?.textContent).toContain("60%");
    expect(dica()?.textContent).toContain("7 gastos");
    fireEvent.blur(mercado);
    expect(dica()).toBeNull();

    fireEvent.pointerEnter(mercado);
    expect(dica()).not.toBeNull();
    fireEvent.keyDown(mercado, { key: "Escape" });
    expect(dica()).toBeNull();
    fireEvent.pointerEnter(mercado);
    fireEvent.pointerLeave(mercado);
    expect(dica()).toBeNull();
  });

  it("'Outras (N tags)' soma o resto e expande a lista das tags, cada uma fixável", () => {
    const muitas = Array.from({ length: 12 }, (_, i): [string, string] => [`t${i}`, `${12 - i}.00`]);
    const aoSelecionar = vi.fn();
    render(<Controlado dados={resumo(...muitas)} aoSelecionar={aoSelecionar} />);

    const outras = screen.getByRole("button", { name: /^Outras \(4 tags\)/ });
    expect(outras.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list", { name: "Tags agrupadas em Outras" })).toBeNull();

    fireEvent.click(outras);

    expect(outras.getAttribute("aria-expanded")).toBe("true");
    const membros = screen.getByRole("list", { name: "Tags agrupadas em Outras" });
    expect(membros.querySelectorAll("button")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: new RegExp("^t11: ") }));
    expect(aoSelecionar).toHaveBeenLastCalledWith("t11");
    expect(screen.getByRole("button", { name: new RegExp("^t11: ") }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(outras);
    expect(screen.queryByRole("list", { name: "Tags agrupadas em Outras" })).toBeNull();
    expect(document.activeElement).toBe(outras);
  });

  it("com movimento, a barra cresce ao aparecer (data-animando) e depois assenta", async () => {
    render(<Controlado dados={BASE} />);
    const [barra] = Array.from(document.querySelectorAll("[data-fracao]"));

    expect(barra.getAttribute("data-animando")).toBe("true");
    await waitFor(() => expect(barra.hasAttribute("data-animando")).toBe(false));
  });

  it("com prefers-reduced-motion não há animação nem transição", () => {
    definirMidia(true);
    render(<Controlado dados={BASE} />);

    for (const barra of Array.from(document.querySelectorAll<HTMLElement>("[data-fracao]"))) {
      expect(barra.hasAttribute("data-animando")).toBe(false);
      expect(barra.style.transition).toBe("none");
      expect(barra.style.inlineSize).not.toBe("0%");
    }
  });

  it("ao trocar de mês, a mesma tag continua na mesma linha e muda de largura", () => {
    definirMidia(true);
    const { rerender } = render(<Controlado dados={resumo(["a", "10.00"], ["b", "10.00"])} />);
    const antes = botoes()[1];
    expect(antes.querySelector("[data-fracao]")?.getAttribute("data-fracao")).toBe("1");

    rerender(<Controlado dados={resumo(["a", "20.00"], ["b", "10.00"])} />);

    const depois = botoes().find((b) => b.textContent?.includes("b"));
    expect(depois).toBe(antes);
    expect(depois?.querySelector("[data-fracao]")?.getAttribute("data-fracao")).toBe("0.5");
  });

  it("a linha acompanha a tag, não a posição, quando a ordem das barras muda", () => {
    definirMidia(true);
    const { rerender } = render(<Controlado dados={resumo(["a", "20.00"], ["b", "10.00"])} />);
    const linhaDeA = botoes().find((b) => b.textContent?.startsWith("a"));

    rerender(<Controlado dados={resumo(["b", "20.00"], ["a", "10.00"])} />);

    expect(botoes().find((b) => b.textContent?.startsWith("a"))).toBe(linhaDeA);
    expect(botoes()[1]).toBe(linhaDeA);
  });

  it("a tabela equivalente traz todas as tags e o total", () => {
    const muitas = Array.from({ length: 12 }, (_, i): [string, string] => [`t${i}`, `${12 - i}.00`]);
    render(<Controlado dados={resumo(...muitas, [null, "1.00"])} />);

    const detalhes = document.querySelector("details") as HTMLDetailsElement;
    expect(detalhes.querySelector("summary")?.textContent).toBe("Ver como tabela");
    const linhas = Array.from(detalhes.querySelectorAll("tbody tr"));
    expect(linhas).toHaveLength(13);
    expect(detalhes.querySelector("tfoot")?.textContent).toContain(`R$${NBSP}79,00`);
  });

  it("sem gastos mostra o estado vazio, sem barras nem tabela", () => {
    render(<Controlado dados={resumo()} />);

    expect(screen.getByText("Sem gastos neste período")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Gastos por tag" })).toBeNull();
    expect(document.querySelector("table")).toBeNull();
  });

  it("carregando sem dados mostra um aviso; carregando com dados mantém o desenho esmaecido", () => {
    const { rerender } = render(
      <GraficoDeBarras resumo={undefined} carregando selecionada={null} aoSelecionar={() => {}} />,
    );
    expect(screen.getByText("Carregando…")).toBeTruthy();

    rerender(<GraficoDeBarras resumo={BASE} carregando={false} selecionada={null} aoSelecionar={() => {}} />);
    rerender(<GraficoDeBarras resumo={undefined} carregando selecionada={null} aoSelecionar={() => {}} />);

    expect(linhasDaLista()).toHaveLength(3);
    expect(document.querySelector("section")?.getAttribute("data-atualizando")).toBe("true");
  });

  it("mantém visível a frase da divisão entre tags", () => {
    render(<Controlado dados={BASE} />);

    expect(screen.getByText(/se divide em partes iguais entre elas/)).toBeTruthy();
  });
});
