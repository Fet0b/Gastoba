import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SeletorMultiplo } from "./SeletorMultiplo";
it("abre opções sem escolher automaticamente e Esc devolve o foco", () => { const mudar = vi.fn(); render(<SeletorMultiplo rotulo="Contas" selecionados={[]} aoMudar={mudar} opcoes={[{ valor: "a", rotulo: "Principal" }]}/>); const abrir = screen.getByRole("button", { name: "Contas: Todas" }); fireEvent.click(abrir); fireEvent.click(screen.getByRole("checkbox", { name: "Principal" })); expect(mudar).toHaveBeenCalledWith(["a"]); fireEvent.keyDown(screen.getByRole("group", { name: "Contas" }), { key: "Escape" }); expect(screen.queryByRole("checkbox")).toBeNull(); expect(document.activeElement).toBe(abrir); });
