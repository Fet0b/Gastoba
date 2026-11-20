import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { chamar } from "../../api/cliente";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { ContadorDaCaixa } from "./ContadorDaCaixa";

beforeEach(() => {
  entrarNaSimulacao();
});

describe("ContadorDaCaixa", () => {
  it("mostra quantas transações esperam na caixa de entrada, em selo de atenção", async () => {
    await chamar("/sincronizacoes", { metodo: "POST" });
    const pendentes = await chamar<unknown[]>("/transacoes-importadas");
    render(<ContadorDaCaixa />);

    const selo = await screen.findByText(`${pendentes.length} ${pendentes.length === 1 ? "pendente" : "pendentes"}`);
    expect(selo.getAttribute("data-tom")).toBe("atencao");
  });

  it("com a caixa vazia não mostra nada", async () => {
    const { container } = render(<ContadorDaCaixa />);

    await waitFor(() => expect(container.textContent).toBe(""));
  });
});
