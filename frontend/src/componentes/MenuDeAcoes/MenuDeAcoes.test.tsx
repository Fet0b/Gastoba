import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MenuDeAcoes, type ItemDoMenu } from "./MenuDeAcoes";

function itens(extra: Partial<ItemDoMenu>[] = []): ItemDoMenu[] {
  const base: ItemDoMenu[] = [
    { rotulo: "Editar", aoEscolher: () => {} },
    { rotulo: "Duplicar", aoEscolher: () => {} },
    { rotulo: "Excluir", destrutivo: true, aoEscolher: () => {} },
  ];
  return base.map((item, i) => ({ ...item, ...(extra[i] ?? {}) }));
}

function gatilho() {
  return screen.getByRole("button", { name: "Mais ações da conta" });
}

function itensAbertos() {
  return screen.getAllByRole("menuitem");
}

describe("MenuDeAcoes", () => {
  it("nunca abre fora da tela: o alinhamento se ajusta ao espaço disponível", () => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      const aberto = this.getAttribute("role") === "menu";
      return { left: aberto ? -116 : 0, right: aberto ? 100 : 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} } as DOMRect;
    };
    try {
      render(<MenuDeAcoes rotulo="Mais ações da conta" itens={itens()} />);
      expect(gatilho().parentElement?.getAttribute("data-alinhamento")).toBe("fim");
      fireEvent.click(gatilho());
      expect(gatilho().parentElement?.getAttribute("data-alinhamento")).toBe("inicio");
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
    }
  });

  it("o gatilho tem nome, aria-haspopup e aria-expanded fechado", () => {
    render(<MenuDeAcoes rotulo="Mais ações da conta" itens={itens()} />);

    expect(gatilho().getAttribute("aria-haspopup")).toBe("menu");
    expect(gatilho().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it.each(["Enter", " ", "ArrowDown"])("%j abre e foca o primeiro item", (tecla) => {
    render(<MenuDeAcoes rotulo="Mais ações da conta" itens={itens()} />);

    fireEvent.keyDown(gatilho(), { key: tecla });

    expect(gatilho().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(itensAbertos()[0]);
  });

  it("o clique no gatilho abre e foca o primeiro item", () => {
    render(<MenuDeAcoes rotulo="Mais ações da conta" itens={itens()} />);

    fireEvent.click(gatilho());

    expect(screen.getByRole("menu", { name: "Mais ações da conta" })).not.toBeNull();
    expect(document.activeElement).toBe(itensAbertos()[0]);
  });

  it("ArrowUp abre e foca o último", () => {
    render(<MenuDeAcoes rotulo="Mais ações da conta" itens={itens()} />);

    fireEvent.keyDown(gatilho(), { key: "ArrowUp" });

    expect(document.activeElement).toBe(itensAbertos()[2]);
  });

  it("as setas circulam pulando os desabilitados, e Home/End vão às pontas", () => {
    render(
      <MenuDeAcoes
        rotulo="Mais ações da conta"
        itens={itens([{}, { desabilitado: true }])}
      />,
    );
    fireEvent.click(gatilho());
    const [editar, , excluir] = itensAbertos();

    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    expect(document.activeElement).toBe(excluir);

    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    expect(document.activeElement).toBe(editar);

    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowUp" });
    expect(document.activeElement).toBe(excluir);

    fireEvent.keyDown(document.activeElement as Element, { key: "Home" });
    expect(document.activeElement).toBe(editar);

    fireEvent.keyDown(document.activeElement as Element, { key: "End" });
    expect(document.activeElement).toBe(excluir);
  });

  it("Esc fecha e devolve o foco ao gatilho", () => {
    render(<MenuDeAcoes rotulo="Mais ações da conta" itens={itens()} />);
    fireEvent.click(gatilho());

    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(gatilho());
  });

  it("Tab fecha o menu", () => {
    render(<MenuDeAcoes rotulo="Mais ações da conta" itens={itens()} />);
    fireEvent.click(gatilho());

    fireEvent.keyDown(document.activeElement as Element, { key: "Tab" });

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("pointerdown fora fecha", () => {
    render(
      <div>
        <button type="button">Fora</button>
        <MenuDeAcoes rotulo="Mais ações da conta" itens={itens()} />
      </div>,
    );
    fireEvent.click(gatilho());

    fireEvent.pointerDown(screen.getByRole("button", { name: "Fora" }));

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("escolher um item fecha, foca o gatilho e só então chama aoEscolher", () => {
    const focoNaChamada: Array<Element | null> = [];
    const aoEscolher = vi.fn(() => focoNaChamada.push(document.activeElement));
    render(
      <MenuDeAcoes
        rotulo="Mais ações da conta"
        itens={[{ rotulo: "Editar", aoEscolher }]}
      />,
    );
    fireEvent.click(gatilho());

    fireEvent.click(screen.getByRole("menuitem", { name: "Editar" }));

    expect(aoEscolher).toHaveBeenCalledTimes(1);
    expect(focoNaChamada[0]).toBe(gatilho());
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("item desabilitado não dispara", () => {
    const aoEscolher = vi.fn();
    render(
      <MenuDeAcoes
        rotulo="Mais ações da conta"
        itens={[{ rotulo: "Editar", desabilitado: true, aoEscolher }]}
      />,
    );
    fireEvent.click(gatilho());

    fireEvent.click(screen.getByRole("menuitem", { name: "Editar" }));

    expect(aoEscolher).not.toHaveBeenCalled();
  });

  it("nomeAcessivel vira o aria-label do item e destrutivo marca data-destrutivo", () => {
    render(
      <MenuDeAcoes
        rotulo="Mais ações do ganho Salário"
        itens={[
          { rotulo: "Excluir", nomeAcessivel: "Excluir o ganho Salário", destrutivo: true, aoEscolher: () => {} },
          { rotulo: "Editar", aoEscolher: () => {} },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mais ações do ganho Salário" }));

    const excluir = screen.getByRole("menuitem", { name: "Excluir o ganho Salário" });
    expect(excluir.getAttribute("aria-label")).toBe("Excluir o ganho Salário");
    expect(excluir.hasAttribute("data-destrutivo")).toBe(true);
    expect(screen.getByRole("menuitem", { name: "Editar" }).hasAttribute("data-destrutivo")).toBe(false);
  });

  it("sem itens não renderiza nada", () => {
    const { container } = render(<MenuDeAcoes rotulo="Mais ações da conta" itens={[]} />);

    expect(container.firstChild).toBeNull();
  });
});
