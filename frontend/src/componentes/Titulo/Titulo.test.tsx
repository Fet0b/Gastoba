import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Titulo } from "./Titulo";
it("permite hierarquia semântica independente da escala visual", () => { render(<Titulo nivel="pagina" como="h1">Contas</Titulo>); expect(screen.getByRole("heading", { level: 1, name: "Contas" }).getAttribute("data-nivel")).toBe("pagina"); });
