import { createRef, type RefObject } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Ganho } from "../../api/tipos";
import { MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";
import { useExcluirGanho } from "./AcaoDeExcluirGanho";

function ganho(descricao: string, recorrenciaId: string | null = null): Ganho {
  return {
    id: descricao, conta_id: "c1", valor: "5000.00", descricao, data: "2026-10-05",
    tags: [], origem: "manual", recorrencia_id: recorrenciaId,
  };
}

type Teste = {
  ganho: Ganho;
  aoExcluir: (ganho: Ganho) => Promise<boolean>;
  focoAposExcluir?: RefObject<HTMLElement | null>;
};

function Linha({ ganho, aoExcluir, focoAposExcluir }: Teste) {
  const { item, dialogo } = useExcluirGanho(ganho, aoExcluir, focoAposExcluir);
  return (
    <div>
      <MenuDeAcoes rotulo={`Mais ações de ${ganho.descricao}`} itens={item ? [item] : []} />
      {dialogo}
    </div>
  );
}

const GATILHO = { name: "Mais ações de Salário" };

function abrirDialogo(): void {
  fireEvent.click(screen.getByRole("button", GATILHO));
  fireEvent.click(screen.getByRole("menuitem", { name: "Excluir o ganho Salário" }));
}

describe("useExcluirGanho", () => {
  it("o item do menu abre o diálogo com título, consequência e foco em Cancelar; só exclui ao confirmar", async () => {
    const aoExcluir = vi.fn().mockResolvedValue(true);
    const salario = ganho("Salário");
    render(<Linha ganho={salario} aoExcluir={aoExcluir} />);

    abrirDialogo();
    const dialogo = screen.getByRole("dialog", { name: "Excluir Salário?" });
    expect(dialogo.textContent).toContain("O valor sai do saldo da conta.");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoExcluir).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
    await waitFor(() => expect(aoExcluir).toHaveBeenCalledWith(salario));
  });

  it("o item é destrutivo e leva o nome acessível Excluir o ganho {descrição}", () => {
    render(<Linha ganho={ganho("Salário")} aoExcluir={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", GATILHO));
    const item = screen.getByRole("menuitem", { name: "Excluir o ganho Salário" });
    expect(item.hasAttribute("data-destrutivo")).toBe(true);
    expect(item.textContent).toBe("Excluir");
  });

  it("Cancelar não exclui e devolve o foco ao gatilho do menu", async () => {
    const aoExcluir = vi.fn().mockResolvedValue(true);
    render(<Linha ganho={ganho("Salário")} aoExcluir={aoExcluir} />);

    abrirDialogo();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(aoExcluir).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", GATILHO)));
  });

  it("Esc (evento cancel) cancela e devolve o foco ao gatilho", async () => {
    const aoExcluir = vi.fn();
    render(<Linha ganho={ganho("Salário")} aoExcluir={aoExcluir} />);

    abrirDialogo();
    fireEvent(screen.getByRole("dialog", { name: "Excluir Salário?" }), new Event("cancel", { cancelable: true }));

    expect(aoExcluir).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", GATILHO)));
  });

  it("enquanto exclui, os botões ficam desabilitados", async () => {
    let concluir: (resultado: boolean) => void = () => {};
    const aoExcluir = vi.fn(() => new Promise<boolean>((resolver) => (concluir = resolver)));
    render(<Linha ganho={ganho("Salário")} aoExcluir={aoExcluir} />);

    abrirDialogo();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(true));
    concluir(true);
  });

  it("se a exclusão falha, o diálogo fecha (a mensagem vai ao aviso da página) e o foco volta ao gatilho", async () => {
    render(<Linha ganho={ganho("Salário")} aoExcluir={vi.fn().mockResolvedValue(false)} />);

    abrirDialogo();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Excluir Salário?" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", GATILHO)));
  });

  it("se a exclusão dá certo, o foco vai para o elemento indicado pela página", async () => {
    const titulo = document.createElement("h2");
    titulo.tabIndex = -1;
    document.body.appendChild(titulo);
    const foco = createRef<HTMLElement>() as RefObject<HTMLElement | null>;
    foco.current = titulo;
    render(<Linha ganho={ganho("Salário")} aoExcluir={vi.fn().mockResolvedValue(true)} focoAposExcluir={foco} />);

    abrirDialogo();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));

    await waitFor(() => expect(document.activeElement).toBe(titulo));
    titulo.remove();
  });

  it("o ganho gerado por uma recorrência não tem o item, nem o gatilho do menu", () => {
    const { container } = render(<Linha ganho={ganho("Salário", "r1")} aoExcluir={vi.fn()} />);

    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("dialog")).toBeNull();
  });
});
