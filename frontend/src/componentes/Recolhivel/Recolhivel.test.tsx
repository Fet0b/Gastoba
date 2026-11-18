import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Recolhivel } from "./Recolhivel";
it("mantém a semântica nativa e o estado inicial explícito", () => { render(<Recolhivel resumo="Detalhes" abertoDeInicio>Dados</Recolhivel>); expect(screen.getByText("Detalhes").closest("details")?.open).toBe(true); });
