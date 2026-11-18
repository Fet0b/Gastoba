import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Categoria, ProgressoDaMeta, ResumoDasMetas } from "../../api/tipos";
import { EXPLICACAO_DA_LIBERDADE_FINANCEIRA } from "./liberdadeFinanceira";
import { MetasDoMes } from "./MetasDoMes";

const CATEGORIAS: Categoria[] = [
  { codigo: "lazer", nome: "Lazer", legada: false },
  { codigo: "gasto_fixo", nome: "Gasto fixo", legada: false },
];

function progresso(alteracoes: Partial<ProgressoDaMeta> = {}): ProgressoDaMeta {
  return {
    categoria: "lazer",
    nome: CATEGORIAS.find((c) => c.codigo === (alteracoes.categoria ?? "lazer"))?.nome ?? alteracoes.categoria ?? "Lazer",
    percentual: 10,
    limite: "500.00",
    gasto: "450.00",
    restante: "50.00",
    percentual_usado: 90,
    situacao: "alerta",
    gasto_bruto: alteracoes.gasto ?? "450.00",
    limite_adicional: "0.00",
    caixinhas: [],
    rentabilidade: null,
    ...alteracoes,
  };
}

describe("MetasDoMes (Início)", () => {
  const resumo: ResumoDasMetas = {
    mes: "2026-10",
    renda: "5000.00",
    renda_base: null,
    renda_de_referencia: "5000.00",
    metas: [
      progresso(),
      progresso({
        categoria: "gasto_fixo",
        percentual: 40,
        situacao: "dentro",
        gasto: "0.00",
        limite: "2000.00",
        restante: "2000.00",
        percentual_usado: 0,
      }),
    ],
  };

  function renderizar(sobras: Partial<Parameters<typeof MetasDoMes>[0]> = {}) {
    const props = {
      resumo,
      carregando: false,
      categorias: CATEGORIAS,
      aoAbrirOrcamento: vi.fn(),
      ...sobras,
    };
    const resultado = render(<MetasDoMes {...props} />);
    return { ...props, ...resultado };
  }

  it("tem o título Metas do mês e uma linha compacta por meta, com anel e sem renda do mês", () => {
    const { container } = renderizar();

    expect(screen.getByRole("heading", { level: 2, name: "Metas do mês" })).toBeTruthy();
    const linhas = container.querySelectorAll("[data-linha-da-meta]");
    expect(linhas).toHaveLength(2);
    linhas.forEach((linha) => expect(linha.hasAttribute("data-compacta")).toBe(true));
    expect(screen.getAllByRole("img", { name: /usado|sem renda/ })).toHaveLength(2);
    expect(screen.getByRole("img", { name: /^Gasto fixo: / })).toBeTruthy();
    expect(container.querySelectorAll("svg circle")).toHaveLength(4);
    expect(container.querySelector("[data-valores]")).toBeNull();
    expect(container.textContent).not.toContain("Renda do mês");
  });

  it("a linha compacta mostra o restante em texto, sem R$ x de R$ y", () => {
    const { container } = renderizar();

    const primeira = container.querySelector("[data-linha-da-meta]") as HTMLElement;
    expect(primeira.querySelector("[data-restante]")?.textContent).toMatch(/^Restam R\$.50,00$/);
    expect(primeira.textContent).not.toContain(" de R$");
  });

  it("cada linha recebe um --indice crescente", () => {
    renderizar();
    const itens = screen.getAllByRole("listitem");
    expect(itens.map((item) => item.style.getPropertyValue("--indice"))).toEqual(["0", "1"]);
  });

  it("Ver orçamento é um botão terciário no cabeçalho e leva ao orçamento", () => {
    const props = renderizar();

    const botao = screen.getByRole("button", { name: "Ver orçamento" });
    expect(botao.getAttribute("data-papel")).toBe("terciaria");
    const cabecalho = screen.getByRole("heading", { name: "Metas do mês" }).parentElement as HTMLElement;
    expect(cabecalho.contains(botao)).toBe(true);
    fireEvent.click(botao);
    expect(props.aoAbrirOrcamento).toHaveBeenCalledTimes(1);
  });

  it("não oferece filtro por categoria nem abre painel (a linha não é clicável)", () => {
    renderizar();
    expect(screen.queryByRole("button", { name: /Ver gastos de/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Ver lançamentos de/ })).toBeNull();
  });

  it("sem metas convida a definir; carregando e falha têm texto próprio", () => {
    const { unmount } = render(
      <MetasDoMes
        resumo={{ mes: "2026-10", renda: "0.00", renda_base: null, renda_de_referencia: "0.00", metas: [] }}
        carregando={false}
        categorias={CATEGORIAS}
        aoAbrirOrcamento={vi.fn()}
      />,
    );
    expect(screen.getByText(/Defina uma meta para acompanhar/)).toBeTruthy();
    unmount();

    const { rerender } = render(
      <MetasDoMes resumo={undefined} carregando categorias={undefined} aoAbrirOrcamento={vi.fn()} />,
    );
    expect(screen.getByText("Carregando as metas…")).toBeTruthy();
    rerender(
      <MetasDoMes resumo={undefined} carregando={false} categorias={undefined} aoAbrirOrcamento={vi.fn()} />,
    );
    expect(screen.getByText("Não foi possível carregar as metas.")).toBeTruthy();
  });

  it("a descrição da Liberdade financeira continua ligada ao anel por aria-describedby", () => {
    renderizar({
      resumo: { ...resumo, metas: [progresso({ categoria: "liberdade_financeira" })] },
    });

    const barra = screen.getByRole("img", { name: /usado/ });
    const idDaDescricao = barra.getAttribute("aria-describedby") as string;
    expect(idDaDescricao).toBeTruthy();
    const texto = document.getElementById(idDaDescricao) as HTMLElement;
    expect(texto.textContent).toBe(EXPLICACAO_DA_LIBERDADE_FINANCEIRA);
    expect(within(document.body).getAllByText(EXPLICACAO_DA_LIBERDADE_FINANCEIRA)).toHaveLength(1);
  });
});
