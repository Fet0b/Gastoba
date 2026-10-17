import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Categoria, ProgressoDaMeta, ResumoDasMetas } from "../../api/tipos";
import { definirMidia } from "../../testes/preparar";
import { CartaoDeMeta, lerPercentual } from "./CartaoDeMeta";
import { Medidor, textoDaSituacao } from "./Medidor";
import { MetasDoMes } from "./MetasDoMes";

const NBSP = "\u{a0}";

const CATEGORIAS: Categoria[] = [
  { codigo: "lazer", nome: "Lazer" },
  { codigo: "gasto_fixo", nome: "Gasto fixo" },
];

function progresso(alteracoes: Partial<ProgressoDaMeta> = {}): ProgressoDaMeta {
  return {
    categoria: "lazer",
    percentual: 10,
    limite: "500.00",
    gasto: "450.00",
    restante: "50.00",
    percentual_usado: 90,
    situacao: "alerta",
    ...alteracoes,
  };
}

describe("Medidor", () => {
  it("é uma barra de progresso com o valor, o limite e o percentual em texto", () => {
    render(<Medidor progresso={progresso()} nomeDaCategoria="Lazer" />);

    const barra = screen.getByRole("progressbar", { name: "Meta de Lazer" });
    expect(barra.getAttribute("aria-valuenow")).toBe("90");
    expect(barra.getAttribute("aria-valuemin")).toBe("0");
    expect(barra.getAttribute("aria-valuemax")).toBe("100");
    expect(barra.getAttribute("aria-valuetext")).toBe(`R$${NBSP}450,00 de R$${NBSP}500,00, 90%`);
    expect(screen.getByText("10% da renda")).toBeTruthy();
  });

  it.each([
    [progresso({ situacao: "dentro", gasto: "100.00", restante: "400.00", percentual_usado: 20 }), `Dentro da meta · restam R$${NBSP}400,00`],
    [progresso(), `Perto do limite · restam R$${NBSP}50,00`],
    [progresso({ situacao: "estourou", gasto: "600.00", restante: "-100.00", percentual_usado: 120 }), `Estourou em R$${NBSP}100,00`],
    [progresso({ situacao: "sem_renda", limite: "0.00", restante: "-450.00", percentual_usado: null }), "Sem renda neste mês"],
  ])("diz a situação em texto: %#", (meta, texto) => {
    expect(textoDaSituacao(meta)).toBe(texto);
  });

  function arco(container: HTMLElement): SVGCircleElement {
    return container.querySelector("circle[data-arco]") as SVGCircleElement;
  }

  function centro(container: HTMLElement): string {
    return container.querySelector("[data-centro]")?.textContent ?? "";
  }

  it.each([
    [20, "20 100"],
    [80, "80 100"],
    [0, "0 100"],
  ])("o arco de %i%% tem o tracejado %j e o centro mostra o percentual", (usado, tracejado) => {
    const { container } = render(
      <Medidor progresso={progresso({ percentual_usado: usado })} nomeDaCategoria="Lazer" />,
    );

    expect(arco(container).getAttribute("stroke-dasharray")).toBe(tracejado);
    expect(arco(container).getAttribute("pathLength")).toBe("100");
    expect(centro(container)).toBe(`${usado}%`);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("estourar não passa de 100% no arco, mostra o percentual real e marca a situação", () => {
    const { container } = render(
      <Medidor
        progresso={progresso({ situacao: "estourou", gasto: "600.00", restante: "-100.00", percentual_usado: 120 })}
        nomeDaCategoria="Lazer"
      />,
    );

    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
    expect(arco(container).getAttribute("stroke-dasharray")).toBe("100 100");
    expect(centro(container)).toBe("120%");
    expect(container.querySelector("[data-situacao]")?.getAttribute("data-situacao")).toBe("estourou");
    expect(container.textContent).toContain("Estourou em");
  });

  it("sem renda o anel fica vazio, com traço no centro", () => {
    const { container } = render(
      <Medidor
        progresso={progresso({ situacao: "sem_renda", limite: "0.00", restante: "-450.00", percentual_usado: null })}
        nomeDaCategoria="Lazer"
      />,
    );

    expect(arco(container).getAttribute("stroke-dasharray")).toBe("0 100");
    expect(centro(container)).toBe("\u2013");
    expect(container.textContent).toContain("Sem renda neste mês");
  });

  it("limite zero com gasto (percentual nulo) enche o anel e omite o percentual", () => {
    const { container } = render(
      <Medidor
        progresso={progresso({ situacao: "estourou", limite: "0.00", gasto: "1.00", restante: "-1.00", percentual_usado: null })}
        nomeDaCategoria="Lazer"
      />,
    );

    const barra = screen.getByRole("progressbar");
    expect(barra.getAttribute("aria-valuenow")).toBe("100");
    expect(barra.getAttribute("aria-valuetext")).toBe(`R$${NBSP}1,00 de R$${NBSP}0,00`);
    expect(arco(container).getAttribute("stroke-dasharray")).toBe("100 100");
    expect(centro(container)).toBe("\u2013");
  });

  it("mostra a situação em texto e o gasto contra o limite em linha própria", () => {
    const { container } = render(<Medidor progresso={progresso()} nomeDaCategoria="Lazer" />);

    expect(container.querySelector("[data-situacao-texto]")?.textContent).toBe(`!Perto do limite · restam R$${NBSP}50,00`);
    expect(container.querySelector("[data-valores]")?.textContent).toBe(`R$${NBSP}450,00 de R$${NBSP}500,00`);
  });

  it.each([
    ["dentro", "\u2713"],
    ["alerta", "!"],
    ["estourou", "\u2715"],
    ["sem_renda", "\u2013"],
  ] as const)("a situação %s aplica o data-situacao e o ícone", (situacao, icone) => {
    const { container } = render(
      <Medidor progresso={progresso({ situacao, percentual_usado: situacao === "sem_renda" ? null : 50 })} nomeDaCategoria="Lazer" />,
    );

    expect(container.querySelector("[data-situacao]")?.getAttribute("data-situacao")).toBe(situacao);
    expect(container.querySelector("[data-situacao-texto] [aria-hidden]")?.textContent).toBe(icone);
  });
});

describe("Medidor vivo", () => {
  function raiz(container: HTMLElement): HTMLElement {
    return container.querySelector("[data-situacao]") as HTMLElement;
  }

  function tracejado(container: HTMLElement): string | null {
    return container.querySelector("circle[data-arco]")?.getAttribute("stroke-dasharray") ?? null;
  }

  it("com movimento permitido o anel tem data-animando; reduzido, não tem, e o arco final é o mesmo", () => {
    const comMovimento = render(<Medidor progresso={progresso()} nomeDaCategoria="Lazer" />);
    expect(raiz(comMovimento.container).hasAttribute("data-animando")).toBe(true);
    const final = tracejado(comMovimento.container);
    comMovimento.unmount();

    definirMidia(true);
    const reduzido = render(<Medidor progresso={progresso()} nomeDaCategoria="Lazer" />);
    expect(raiz(reduzido.container).hasAttribute("data-animando")).toBe(false);
    expect(tracejado(reduzido.container)).toBe(final);
    definirMidia(false);
  });

  it("sem renda o anel vazio não anima nem pulsa", () => {
    const { container } = render(
      <Medidor progresso={progresso({ situacao: "sem_renda", percentual_usado: null })} nomeDaCategoria="Lazer" />,
    );
    expect(raiz(container).hasAttribute("data-animando")).toBe(false);
    expect(raiz(container).hasAttribute("data-pulso")).toBe(false);
  });

  it.each([
    ["dentro", false],
    ["alerta", true],
    ["estourou", true],
  ] as const)("a situação %s marca o pulso: %s", (situacao, pulsa) => {
    const { container } = render(
      <Medidor progresso={progresso({ situacao, percentual_usado: 120 })} nomeDaCategoria="Lazer" />,
    );
    expect(raiz(container).hasAttribute("data-pulso")).toBe(pulsa);
  });

  it("acima de 100% o arco enche até o cheio e o centro mostra o valor real", () => {
    const { container } = render(
      <Medidor progresso={progresso({ situacao: "estourou", percentual_usado: 140 })} nomeDaCategoria="Lazer" />,
    );
    expect(tracejado(container)).toBe("100 100");
    expect(container.querySelector("[data-centro]")?.textContent).toBe("140%");
  });

  it("trocar o valor mantém o mesmo elemento do arco (a transição o move)", () => {
    const { container, rerender } = render(<Medidor progresso={progresso({ percentual_usado: 30 })} nomeDaCategoria="Lazer" />);
    const antes = container.querySelector("circle[data-arco]");
    rerender(<Medidor progresso={progresso({ percentual_usado: 60 })} nomeDaCategoria="Lazer" />);
    expect(container.querySelector("circle[data-arco]")).toBe(antes);
    expect(tracejado(container)).toBe("60 100");
  });
});

describe("MetasDoMes", () => {
  const resumo: ResumoDasMetas = {
    mes: "2026-10",
    renda: "5000.00",
    metas: [progresso(), progresso({ categoria: "gasto_fixo", percentual: 40, situacao: "dentro", gasto: "0.00", limite: "2000.00", restante: "2000.00", percentual_usado: 0 })],
  };

  function renderizar(sobras: Partial<Parameters<typeof MetasDoMes>[0]> = {}) {
    const props = {
      resumo,
      carregando: false,
      categorias: CATEGORIAS,
      aoAbrirOrcamento: vi.fn(),
      aoAlternarCategoria: vi.fn(),
      categoriaAtiva: null,
      ...sobras,
    };
    render(<MetasDoMes {...props} />);
    return props;
  }

  it("mostra a renda do mês e uma barra por meta, com o nome da categoria", () => {
    renderizar();

    // O getByText normaliza o espaço sem quebra; a checagem exata usa o textContent.
    expect(screen.getByText(/Renda do mês/).textContent).toContain(`R$${NBSP}5.000,00`);
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
    expect(screen.getByRole("progressbar", { name: "Meta de Gasto fixo" })).toBeTruthy();
  });

  it("cada item recebe um --indice crescente", () => {
    renderizar();
    const itens = screen.getAllByRole("listitem");
    expect(itens.map((item) => item.style.getPropertyValue("--indice"))).toEqual(["0", "1"]);
  });

  it("trocar o mês mantém os elementos dos anéis e remover uma meta não remonta os restantes", () => {
    const props = {
      carregando: false,
      categorias: CATEGORIAS,
      aoAbrirOrcamento: vi.fn(),
      aoAlternarCategoria: vi.fn(),
      categoriaAtiva: null,
    };
    const { container, rerender } = render(<MetasDoMes resumo={resumo} {...props} />);
    const arcos = () => Array.from(container.querySelectorAll("circle[data-arco]"));
    const [primeiro, segundo] = arcos();

    const outroMes: ResumoDasMetas = {
      ...resumo,
      mes: "2026-11",
      metas: [progresso({ gasto: "100.00", percentual_usado: 10 }), resumo.metas[1]],
    };
    rerender(<MetasDoMes resumo={outroMes} {...props} />);
    expect(arcos()).toEqual([primeiro, segundo]);

    rerender(<MetasDoMes resumo={{ ...outroMes, metas: [outroMes.metas[1]] }} {...props} />);
    expect(arcos()).toEqual([segundo]);
  });

  it("o botão da categoria filtra os gastos e clicar na ativa limpa", () => {
    const props = renderizar();
    fireEvent.click(screen.getByRole("button", { name: "Ver gastos de Lazer" }));
    expect(props.aoAlternarCategoria).toHaveBeenCalledWith("lazer");

    render(<MetasDoMes resumo={resumo} carregando={false} categorias={CATEGORIAS} aoAbrirOrcamento={vi.fn()} aoAlternarCategoria={vi.fn()} categoriaAtiva="lazer" />);
    expect(screen.getAllByRole("button", { name: "Limpar filtro" })).toHaveLength(1);
  });

  it("Ver orçamento leva à aba de orçamento", () => {
    const props = renderizar();

    fireEvent.click(screen.getByRole("button", { name: "Ver orçamento" }));

    expect(props.aoAbrirOrcamento).toHaveBeenCalledTimes(1);
  });

  it("sem aoAlternarCategoria não há botões de filtrar por categoria", () => {
    render(
      <MetasDoMes resumo={resumo} carregando={false} categorias={CATEGORIAS} aoAbrirOrcamento={vi.fn()} />,
    );

    expect(screen.queryByRole("button", { name: /Ver gastos de/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Limpar filtro" })).toBeNull();
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
  });

  it("sem metas convida a definir; carregando e falha têm texto próprio", () => {
    const { unmount } = render(
      <MetasDoMes resumo={{ mes: "2026-10", renda: "0.00", metas: [] }} carregando={false} categorias={CATEGORIAS} aoAbrirOrcamento={vi.fn()} aoAlternarCategoria={vi.fn()} categoriaAtiva={null} />,
    );
    expect(screen.getByText(/Defina uma meta para acompanhar/)).toBeTruthy();
    unmount();

    const { rerender } = render(
      <MetasDoMes resumo={undefined} carregando categorias={undefined} aoAbrirOrcamento={vi.fn()} aoAlternarCategoria={vi.fn()} categoriaAtiva={null} />,
    );
    expect(screen.getByText("Carregando as metas…")).toBeTruthy();
    rerender(
      <MetasDoMes resumo={undefined} carregando={false} categorias={undefined} aoAbrirOrcamento={vi.fn()} aoAlternarCategoria={vi.fn()} categoriaAtiva={null} />,
    );
    expect(screen.getByText("Não foi possível carregar as metas.")).toBeTruthy();
  });
});

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
  ])("%j → %j", (texto, esperado) => {
    expect(lerPercentual(texto)).toBe(esperado);
  });
});

describe("CartaoDeMeta", () => {
  const lazer = CATEGORIAS[0];

  function renderizar(sobras: Partial<Parameters<typeof CartaoDeMeta>[0]> = {}) {
    const props = {
      categoria: lazer,
      percentual: undefined as number | undefined,
      progresso: undefined,
      renda: "5000.00",
      somaDasOutras: 60,
      editando: false,
      aoEditar: vi.fn(),
      aoCancelar: vi.fn(),
      aoSalvar: vi.fn(async () => {}),
      aoRemover: vi.fn(async () => true),
      salvando: false,
      ...sobras,
    };
    const resultado = render(
      <ul>
        <CartaoDeMeta {...props} />
      </ul>,
    );
    return { props, ...resultado };
  }

  it("sem meta mostra 'Sem meta' e o botão Definir meta", () => {
    const { props } = renderizar();

    expect(screen.getByText("Sem meta")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Definir meta de Lazer" }));
    expect(props.aoEditar).toHaveBeenCalledTimes(1);
  });

  it("com meta mostra o medidor e os botões Alterar e Remover", () => {
    const { props } = renderizar({ percentual: 10, progresso: progresso() });

    expect(screen.getByRole("progressbar", { name: "Meta de Lazer" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Alterar a meta de Lazer" }));
    expect(props.aoEditar).toHaveBeenCalledTimes(1);
  });

  it("o formulário mostra quanto o percentual vale no mês e a soma das metas", () => {
    renderizar({ editando: true, somaDasOutras: 20 });

    fireEvent.change(screen.getByLabelText("Percentual da renda para Lazer"), { target: { value: "30" } });

    expect(screen.getByText(/30% equivale a/).textContent).toContain(`R$${NBSP}1.500,00`);
    expect(screen.getByText("Soma das metas: 50% de 100%.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Salvar meta" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("soma acima de 100% avisa que a meta está extrapolando e não deixa salvar", () => {
    const { props } = renderizar({ editando: true, somaDasOutras: 80 });

    fireEvent.change(screen.getByLabelText("Percentual da renda para Lazer"), { target: { value: "30" } });

    expect(screen.getByRole("alert").textContent).toBe("A soma das metas está em 110%: passa de 100% da renda.");
    const salvar = screen.getByRole("button", { name: "Salvar meta" }) as HTMLButtonElement;
    expect(salvar.disabled).toBe(true);
    expect(screen.getByLabelText("Percentual da renda para Lazer").getAttribute("aria-invalid")).toBe("true");
    fireEvent.submit(salvar.closest("form") as HTMLFormElement);
    expect(props.aoSalvar).not.toHaveBeenCalled();
  });

  it("exatamente 100% pode salvar e salvar envia o número", async () => {
    const { props } = renderizar({ editando: true, somaDasOutras: 70 });

    fireEvent.change(screen.getByLabelText("Percentual da renda para Lazer"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar meta" }));

    await waitFor(() => expect(props.aoSalvar).toHaveBeenCalledWith(30));
  });

  it.each(["", "0", "101", "2,5", "abc"])("percentual %j desabilita o botão", (texto) => {
    renderizar({ editando: true });

    fireEvent.change(screen.getByLabelText("Percentual da renda para Lazer"), { target: { value: texto } });

    expect((screen.getByRole("button", { name: "Salvar meta" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("abre com o percentual atual e o foco no campo; Cancelar fecha", () => {
    const { props } = renderizar({ editando: true, percentual: 15 });

    const campo = screen.getByLabelText("Percentual da renda para Lazer") as HTMLInputElement;
    expect(campo.value).toBe("15");
    expect(document.activeElement).toBe(campo);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(props.aoCancelar).toHaveBeenCalledTimes(1);
  });

  it("mostra o erro da API junto ao campo", () => {
    renderizar({ editando: true, erro: "As metas somariam 120% da renda; o máximo é 100%." });

    expect(screen.getByText("As metas somariam 120% da renda; o máximo é 100%.")).toBeTruthy();
  });

  it("remover pede confirmação na própria linha", async () => {
    const { props } = renderizar({ percentual: 10, progresso: progresso() });

    fireEvent.click(screen.getByRole("button", { name: "Remover a meta de Lazer" }));
    const grupo = screen.getByRole("group");
    expect(grupo.textContent).toContain("Remover a meta de Lazer?");
    fireEvent.click(within(grupo).getByRole("button", { name: "Confirmar remoção" }));

    await waitFor(() => expect(props.aoRemover).toHaveBeenCalledTimes(1));
  });

  it("cancelar a remoção volta aos botões sem remover", () => {
    const { props } = renderizar({ percentual: 10, progresso: progresso() });

    fireEvent.click(screen.getByRole("button", { name: "Remover a meta de Lazer" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(props.aoRemover).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remover a meta de Lazer" })).toBeTruthy();
  });
});
