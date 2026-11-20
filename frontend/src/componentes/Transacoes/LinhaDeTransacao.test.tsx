import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Ganho } from "../../api/tipos";
import type { TransacaoDaLinha } from "../../transacoes/linhaDoTempo";
import type { ItemDoMenu } from "../MenuDeAcoes/MenuDeAcoes";
import { LinhaDeTransacao } from "./LinhaDeTransacao";

const NBSP = "\u{a0}";
const MENOS = "\u{2212}";
const PONTO_DO_MEIO = "\u{b7}";

const GASTO: TransacaoDaLinha = {
  tipo: "gasto",
  id: "g1",
  conta_id: "c1",
  valor: "25.90",
  descricao: "Mercado",
  data: "2026-10-10",
  categoria: "lazer",
  tags: ["pix", "mercado"],
  origem: "manual",
  recorrencia_id: null,
  valor_coberto: "0.00",
  coberturas: [],
};

const GANHO: TransacaoDaLinha = {
  tipo: "ganho",
  id: "n1",
  conta_id: "c1",
  valor: "1000.10",
  descricao: "Salário",
  data: "2026-10-05",
  tags: [],
  origem: "manual",
  recorrencia_id: "r1",
} satisfies Ganho & { tipo: "ganho" };

type Extras = Partial<Parameters<typeof LinhaDeTransacao>[0]>;

function desenhar(transacao: TransacaoDaLinha, extras: Extras = {}) {
  return render(
    <ul>
      <LinhaDeTransacao transacao={transacao} nomeDaConta="Nubank" nomeDaCategoria="Lazer" {...extras} />
    </ul>,
  );
}

function abrirMenu(descricao: string): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: `Mais ações de ${descricao}` }));
  return screen.getByRole("menu");
}

const COM_COBERTURA: TransacaoDaLinha = {
  ...GASTO,
  tags: [],
  valor_coberto: "30.00",
  coberturas: [{ id: "cb1", tag: "celular", valor: "30.00" }],
};

describe("LinhaDeTransacao", () => {
  it("a saída leva o sinal de menos e o sentido de saída", () => {
    const { container } = desenhar(GASTO);

    const linha = container.querySelector("li") as HTMLElement;
    expect(linha.getAttribute("data-sentido")).toBe("saida");
    expect(linha.querySelector("[data-valor]")?.textContent).toBe(`${MENOS}R$${NBSP}25,90`);
  });

  it("a entrada leva o sinal de mais e o sentido de entrada", () => {
    const { container } = desenhar(GANHO);

    const linha = container.querySelector("li") as HTMLElement;
    expect(linha.getAttribute("data-sentido")).toBe("entrada");
    expect(linha.querySelector("[data-valor]")?.textContent).toBe(`+R$${NBSP}1.000,10`);
  });

  it("a descrição vinda do banco em caixa alta é normalizada, e o texto inteiro fica no title", () => {
    const { container } = desenhar({ ...GASTO, descricao: "OXXO LARGO DO AROUCHE" });

    const descricao = container.querySelector("[data-descricao]");
    expect(descricao?.textContent).toBe("Oxxo Largo Do Arouche");
    expect(descricao?.getAttribute("title")).toBe("Oxxo Largo Do Arouche");
  });

  it("nível 1 tem descrição e valor; nível 2 tem conta e categoria em selos e as tags", () => {
    const { container } = desenhar(GASTO);

    expect(container.querySelector("[data-categoria='lazer']")).not.toBeNull();
    expect(container.querySelector("[data-descricao]")?.textContent).toBe("Mercado");
    const selos = Array.from(container.querySelectorAll("[data-badge]")).map((b) => b.textContent);
    expect(selos).toContain("Nubank");
    expect(selos).toContain("Lazer");
    expect(selos).toContain("pix");
    expect(selos).toContain("mercado");
  });

  it("não usa o ponto do meio como separador", () => {
    const { container } = desenhar(COM_COBERTURA, { comReservas: true });

    expect(container.textContent).not.toContain(PONTO_DO_MEIO);
    expect(container.querySelector("li")?.getAttribute("aria-label")).not.toContain(PONTO_DO_MEIO);
  });

  it("o nome acessível lê o sentido, o valor, a descrição, a categoria e a conta", () => {
    const { container } = desenhar(GASTO);

    expect(container.querySelector("li")?.getAttribute("aria-label")).toBe(
      `Saída de R$${NBSP}25,90, Mercado, Lazer, Nubank`,
    );
  });

  it("o ganho de recorrência traz a marca Recorrente num Badge e não tem categoria", () => {
    const { container } = desenhar(GANHO);

    const marca = within(container).getByText("Recorrente");
    expect(marca.closest("[data-badge]")).not.toBeNull();
    expect(container.textContent).not.toContain("Lazer");
    expect(container.querySelector("li")?.getAttribute("aria-label")).toBe(
      `Entrada de R$${NBSP}1.000,10, Salário, Nubank`,
    );
  });

  it("o aporte de investimento traz o Badge próprio", () => {
    const aporte = {
      tipo: "aporte",
      id: "a1",
      conta_id: "c1",
      valor: "50.00",
      descricao: "Aporte CDB",
      data: "2026-10-10",
      categoria: "lazer",
      tags: [],
      recorrencia_id: null,
    } as unknown as TransacaoDaLinha;
    desenhar(aporte);

    expect(screen.getByText("Aporte em investimento").closest("[data-badge]")).not.toBeNull();
  });

  it("sem itens no menu, sem reserva e sem filtros, a linha não tem nenhum botão", () => {
    desenhar(GASTO);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("os itens por prop ficam num menu Mais ações de {descrição}, e escolher chama a ação", () => {
    const aoEscolher = vi.fn();
    const itens: ItemDoMenu[] = [
      { rotulo: "Excluir", nomeAcessivel: "Excluir o ganho Salário", destrutivo: true, aoEscolher },
    ];
    desenhar(GANHO, { itensDoMenu: itens });

    const menu = abrirMenu("Salário");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Excluir o ganho Salário" }));
    expect(aoEscolher).toHaveBeenCalledTimes(1);
  });

  it("com os callbacks, categoria conhecida e cada tag são Chips pequenos que filtram; a ativa fica pressionada", () => {
    const aoAlternarCategoria = vi.fn();
    const aoAlternarTag = vi.fn();
    desenhar(GASTO, {
      categoriaConhecida: true,
      categoriasAtivas: ["lazer"],
      tagsAtivas: ["pix"],
      aoAlternarCategoria,
      aoAlternarTag,
    });

    const categoria = screen.getByRole("button", { name: "Filtrar por Lazer" });
    expect(categoria.hasAttribute("data-chip")).toBe(true);
    expect(categoria.getAttribute("data-tamanho")).toBe("pequeno");
    expect(categoria.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(categoria);
    expect(aoAlternarCategoria).toHaveBeenCalledWith("lazer");

    const pix = screen.getByRole("button", { name: "Filtrar pela tag pix" });
    const mercado = screen.getByRole("button", { name: "Filtrar pela tag mercado" });
    expect(pix.getAttribute("aria-pressed")).toBe("true");
    expect(mercado.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(mercado);
    expect(aoAlternarTag).toHaveBeenCalledWith("mercado");
  });

  it("os únicos botões da linha são o gatilho do menu e os chips de categoria e tags; conta e Recorrente são Badge", () => {
    const { container } = desenhar(
      { ...GASTO, recorrencia_id: "r9" },
      {
        comReservas: true,
        categoriaConhecida: true,
        aoAlternarCategoria: vi.fn(),
        aoAlternarTag: vi.fn(),
      },
    );

    const nomes = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(nomes).toEqual([
      "Filtrar por Lazer",
      "Filtrar pela tag pix",
      "Filtrar pela tag mercado",
      "Mais ações de Mercado",
    ]);
    const badges = Array.from(container.querySelectorAll("[data-badge]")).map((b) => b.textContent);
    expect(badges).toContain("Nubank");
    expect(badges).toContain("Recorrente");
  });

  it("categoria desconhecida não vira filtro (o backend recusaria o código), mas as tags sim", () => {
    desenhar(
      { ...GASTO, categoria: "viagem" },
      {
        nomeDaCategoria: "viagem",
        categoriaConhecida: false,
        aoAlternarCategoria: vi.fn(),
        aoAlternarTag: vi.fn(),
      },
    );

    expect(screen.queryByRole("button", { name: /Filtrar por viagem/ })).toBeNull();
    expect(screen.getByText("viagem")).not.toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("o ganho não tem categoria para filtrar, mas as tags dele filtram", () => {
    desenhar({ ...GANHO, tags: ["salario"] }, { aoAlternarCategoria: vi.fn(), aoAlternarTag: vi.fn() });

    expect(screen.queryByRole("button", { name: /Filtrar por /i })).toBeNull();
    expect(screen.getByRole("button", { name: "Filtrar pela tag salario" })).not.toBeNull();
  });

  it("com reservas, o menu traz Usar reserva de uma destinação, que abre o diálogo de cobertura", () => {
    desenhar(GASTO, { comReservas: true });

    const menu = abrirMenu("Mercado");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Usar reserva de uma destinação" }));

    expect(screen.getByRole("dialog", { name: "Usar reserva de uma destinação" })).not.toBeNull();
  });

  it("sem reservas (sem comReservas), não há item de reserva nem de cobertura e nem gatilho do menu", () => {
    desenhar(COM_COBERTURA);

    expect(screen.queryByRole("button", { name: /Mais ações/ })).toBeNull();
  });

  it("a cobertura é um Badge Reserva «tag» R$ X, e o menu traz Desfazer cobertura de {tag}, que chama a API", async () => {
    desenhar(COM_COBERTURA, { comReservas: true });

    const reserva = screen.getByText(/^Reserva «celular»/).closest("[data-badge]");
    expect(reserva?.textContent).toBe(`Reserva «celular» R$${NBSP}30,00`);
    const chamadas: Array<[string, string | undefined]> = [];
    const original = globalThis.fetch;
    globalThis.fetch = ((entrada: RequestInfo | URL, init?: RequestInit) => {
      chamadas.push([String(entrada instanceof Request ? entrada.url : entrada), init?.method]);
      return original(entrada, init);
    }) as typeof fetch;
    try {
      const menu = abrirMenu("Mercado");
      fireEvent.click(within(menu).getByRole("menuitem", { name: "Desfazer cobertura de celular" }));
      await waitFor(() =>
        expect(
          chamadas.some(([url, metodo]) => url.includes("/gastos/g1/coberturas/cb1") && metodo === "DELETE"),
        ).toBe(true),
      );
    } finally {
      globalThis.fetch = original;
    }
  });
});

it("desfaz classificação importada só após consultar a prévia e confirmar", async () => {
  const chamadas: string[] = [];
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, opcoes?: RequestInit) => {
    const caminho = String(url);
    chamadas.push(`${opcoes?.method ?? "GET"} ${caminho}`);
    if (caminho.endsWith("/impacto-da-reversao")) return new Response(JSON.stringify({
      transacao_id: "t1", transacoes_reabertas: 1, coberturas_removidas: 0, versao: "v1", lancamentos_removidos: 1, divisao_inteira: false,
    }));
    if (caminho.endsWith("/desfazer-classificacao")) {
      expect(JSON.parse(String(opcoes?.body))).toEqual({ versao_esperada: "v1", desfazer_divisao_inteira: false, desfazer_dependencias: false });
      return new Response(JSON.stringify({ transacao_id: "t1", estado: "pendente", lancamentos_removidos: 1 }));
    }
    return new Response("[]");
  });
  desenhar({ ...GASTO, origem: "open_finance", transacao_importada_id: "t1" }, { podeDesfazerClassificacao: true });
  const menu = abrirMenu("Mercado");
  fireEvent.click(within(menu).getByRole("menuitem", { name: "Desfazer classificação" }));
  await screen.findByRole("dialog");
  expect(chamadas.some(c => c.startsWith("POST"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Sim, desfazer" }));
  await waitFor(() => expect(chamadas.some(c => c.startsWith("POST"))).toBe(true));
});
