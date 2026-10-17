import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AvisoDoMes } from "./AvisoDoMes";

describe("AvisoDoMes", () => {
  it("é um status com ícone e texto", () => {
    render(<AvisoDoMes aviso={{ categoria: "lazer", situacao: "alerta", texto: "Lazer a 85% da meta" }} />);

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Lazer a 85% da meta");
    expect(status.querySelector("svg")).not.toBeNull();
    expect(status.getAttribute("data-situacao")).toBe("alerta");
  });

  it("sem aviso, não renderiza nada", () => {
    const { container } = render(<AvisoDoMes aviso={null} />);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
