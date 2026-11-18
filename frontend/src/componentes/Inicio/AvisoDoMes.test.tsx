import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

  it("é um cartão com título curto, a frase e um único status", () => {
    const { container } = render(
      <AvisoDoMes
        aviso={{ categoria: "lazer", situacao: "estourou", texto: "Lazer estourou a meta em R$ 5,00" }}
        aoVerOrcamento={() => {}}
      />,
    );

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(container.querySelector("[data-titulo]")?.textContent).toBe("Meta estourada");
    expect(screen.getByRole("status").textContent).toContain("Lazer estourou a meta em R$ 5,00");
  });

  it("Ver orçamento chama a ação, e sem ação não há botão", () => {
    const aoVerOrcamento = vi.fn();
    const { unmount } = render(
      <AvisoDoMes
        aviso={{ categoria: "lazer", situacao: "alerta", texto: "Lazer a 85% da meta" }}
        aoVerOrcamento={aoVerOrcamento}
      />,
    );
    const botao = screen.getByRole("button", { name: "Ver orçamento" });
    expect(botao.getAttribute("data-papel")).toBe("terciaria");
    fireEvent.click(botao);
    expect(aoVerOrcamento).toHaveBeenCalledTimes(1);
    unmount();

    render(<AvisoDoMes aviso={{ categoria: "lazer", situacao: "alerta", texto: "x" }} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
