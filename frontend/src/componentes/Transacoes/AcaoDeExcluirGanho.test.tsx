import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Ganho } from "../../api/tipos";
import { AcaoDeExcluirGanho } from "./AcaoDeExcluirGanho";

function ganho(descricao: string, recorrenciaId: string | null = null): Ganho {
  return {
    id: descricao, conta_id: "c1", valor: "5000.00", descricao, data: "2026-10-05",
    tags: [], origem: "manual", recorrencia_id: recorrenciaId,
  };
}

const EXCLUIR = { name: "Excluir o ganho Salário" };

describe("AcaoDeExcluirGanho", () => {
  it("pede confirmação na própria linha, com foco em Cancelar, e só exclui ao confirmar", async () => {
    const aoExcluir = vi.fn().mockResolvedValue(true);
    const salario = ganho("Salário");
    render(<AcaoDeExcluirGanho ganho={salario} aoExcluir={aoExcluir} />);

    fireEvent.click(screen.getByRole("button", EXCLUIR));
    const grupo = screen.getByRole("group");
    expect(grupo.textContent).toContain("O valor sai do saldo da conta");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoExcluir).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
    await waitFor(() => expect(aoExcluir).toHaveBeenCalledWith(salario));
  });

  it("cancelar não exclui e devolve o foco ao botão Excluir", async () => {
    const aoExcluir = vi.fn().mockResolvedValue(true);
    render(<AcaoDeExcluirGanho ganho={ganho("Salário")} aoExcluir={aoExcluir} />);

    fireEvent.click(screen.getByRole("button", EXCLUIR));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(aoExcluir).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", EXCLUIR)),
    );
  });

  it("se a exclusão falha, a confirmação fecha e o botão volta", async () => {
    render(
      <AcaoDeExcluirGanho ganho={ganho("Salário")} aoExcluir={vi.fn().mockResolvedValue(false)} />,
    );

    fireEvent.click(screen.getByRole("button", EXCLUIR));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));

    await waitFor(() => expect(screen.queryByRole("group")).toBeNull());
    expect(screen.getByRole("button", EXCLUIR)).toBeTruthy();
  });

  it("o ganho gerado por uma recorrência não tem o botão Excluir", () => {
    const { container } = render(
      <AcaoDeExcluirGanho ganho={ganho("Salário", "r1")} aoExcluir={vi.fn()} />,
    );

    expect(screen.queryByRole("button")).toBeNull();
    expect(container.textContent).toBe("");
  });
});
