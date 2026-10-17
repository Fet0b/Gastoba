import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Ganho } from "../../api/tipos";
import type { TransacaoDaLinha } from "../../transacoes/linhaDoTempo";
import { LinhaDeTransacao } from "./LinhaDeTransacao";

const NBSP = "\u{a0}";
const MENOS = "\u{2212}";

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

function desenhar(transacao: TransacaoDaLinha, extras: { acao?: ReactNode } = {}) {
  return render(
    <ul>
      <LinhaDeTransacao
        transacao={transacao}
        nomeDaConta="Nubank"
        nomeDaCategoria="Lazer"
        acao={extras.acao}
      />
    </ul>,
  );
}

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

  it("mostra o ícone e o nome da categoria em texto, a conta e as tags", () => {
    const { container } = desenhar(GASTO);

    expect(container.querySelector("[data-categoria='lazer']")).not.toBeNull();
    const texto = container.textContent ?? "";
    expect(texto).toContain("Lazer");
    expect(texto).toContain("Nubank");
    expect(texto).toContain("pix");
    expect(texto).toContain("mercado");
  });

  it("o nome acessível lê o sentido, o valor, a descrição, a categoria e a conta", () => {
    const { container } = desenhar(GASTO);

    expect(container.querySelector("li")?.getAttribute("aria-label")).toBe(
      `Saída de R$${NBSP}25,90, Mercado, Lazer, Nubank`,
    );
  });

  it("o ganho de recorrência traz a marca Recorrente e o ganho não tem categoria em texto", () => {
    const { container } = desenhar(GANHO);

    expect(container.textContent).toContain("Recorrente");
    expect(container.textContent).not.toContain("Lazer");
    expect(container.querySelector("li")?.getAttribute("aria-label")).toBe(
      `Entrada de R$${NBSP}1.000,10, Salário, Nubank`,
    );
  });

  it("a ação opcional aparece na linha; sem ela, não há botão", () => {
    const { rerender } = desenhar(GASTO);
    expect(screen.queryByRole("button")).toBeNull();

    rerender(
      <ul>
        <LinhaDeTransacao transacao={GASTO} nomeDaConta="Nubank" nomeDaCategoria="Lazer" acao={<button type="button">Excluir</button>} />
      </ul>,
    );
    expect(screen.getByRole("button", { name: "Excluir" })).not.toBeNull();
  });

  it("sem os callbacks de filtro, categoria e tags são só texto", () => {
    desenhar(GASTO);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("com os callbacks, a categoria conhecida e cada tag são botões que filtram; a ativa fica pressionada", () => {
    const aoAlternarCategoria = vi.fn();
    const aoAlternarTag = vi.fn();
    render(
      <ul>
        <LinhaDeTransacao
          transacao={GASTO}
          nomeDaConta="Nubank"
          nomeDaCategoria="Lazer"
          categoriaConhecida
          categoriaAtiva="lazer"
          tagAtiva="pix"
          aoAlternarCategoria={aoAlternarCategoria}
          aoAlternarTag={aoAlternarTag}
        />
      </ul>,
    );

    const categoria = screen.getByRole("button", { name: "Filtrar por Lazer" });
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

  it("categoria desconhecida não vira filtro (o backend recusaria o código), mas as tags sim", () => {
    render(
      <ul>
        <LinhaDeTransacao
          transacao={{ ...GASTO, categoria: "viagem" }}
          nomeDaCategoria="viagem"
          categoriaConhecida={false}
          aoAlternarCategoria={vi.fn()}
          aoAlternarTag={vi.fn()}
        />
      </ul>,
    );

    expect(screen.queryByRole("button", { name: /Filtrar por viagem/ })).toBeNull();
    expect(screen.getByText(/viagem/)).not.toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("o ganho não tem categoria para filtrar, mas as tags dele filtram", () => {
    render(
      <ul>
        <LinhaDeTransacao
          transacao={{ ...GANHO, tags: ["salario"] }}
          nomeDaConta="Nubank"
          aoAlternarCategoria={vi.fn()}
          aoAlternarTag={vi.fn()}
        />
      </ul>,
    );

    expect(screen.queryByRole("button", { name: /Filtrar por /i })).toBeNull();
    expect(screen.getByRole("button", { name: "Filtrar pela tag salario" })).not.toBeNull();
  });
});
