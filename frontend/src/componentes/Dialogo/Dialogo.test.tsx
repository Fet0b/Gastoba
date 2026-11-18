import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Dialogo } from "./Dialogo";
it("Esc fecha e devolve o foco ao acionador", () => { function Exemplo() { const [aberto, mudar] = useState(false); return <><button onClick={() => mudar(true)}>Abrir</button><Dialogo aberto={aberto} titulo="Conferência" aoFechar={() => mudar(false)} rodape={<button onClick={() => mudar(false)}>Concluir</button>}>Dados</Dialogo></>; } render(<Exemplo />); const abrir = screen.getByRole("button", { name: "Abrir" }); abrir.focus(); fireEvent.click(abrir); const dialogo = screen.getByRole("dialog", { name: "Conferência" }); fireEvent(dialogo, new Event("cancel", { cancelable: true })); expect(document.activeElement).toBe(abrir); expect(document.querySelector("dialog")?.open).toBe(false); });
