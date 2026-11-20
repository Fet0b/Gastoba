import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SeletorMultiplo } from "./SeletorMultiplo";
it("abre opções sem escolher automaticamente e Esc devolve o foco", () => { const mudar = vi.fn(); render(<SeletorMultiplo rotulo="Contas" selecionados={[]} aoMudar={mudar} opcoes={[{ valor: "a", rotulo: "Principal" }]}/>); const abrir = screen.getByRole("button", { name: "Contas: Todas" }); fireEvent.click(abrir); fireEvent.click(screen.getByRole("checkbox", { name: "Principal" })); expect(mudar).toHaveBeenCalledWith(["a"]); fireEvent.keyDown(screen.getByRole("group", { name: "Contas" }), { key: "Escape" }); expect(screen.queryByRole("checkbox")).toBeNull(); expect(document.activeElement).toBe(abrir); });
it("opção desabilitada não muda a escolha e mostra o motivo", () => { render(<SeletorMultiplo rotulo="Caixinhas" selecionados={[]} aoMudar={vi.fn()} opcoes={[{ valor: "a", rotulo: "Computador", desabilitada: true, ajuda: "Em uso em Conforto" }]}/>); fireEvent.click(screen.getByRole("button", { name: "Caixinhas: Todas" })); const caixa = screen.getByRole("checkbox", { name: /Computador/ }) as HTMLInputElement; expect(caixa.disabled).toBe(true); expect(caixa.getAttribute("aria-describedby")).toBeTruthy(); expect(screen.getByText("Em uso em Conforto")).toBeTruthy(); });

it("a opção da lista de escolha quebra em até duas linhas, com o texto inteiro na dica", () => {
    const longo = "Conta corrente do trabalho e das viagens, final 0412";
    render(<SeletorMultiplo rotulo="Contas" opcoes={[{ valor: "a", rotulo: longo }]} selecionados={[]} aoMudar={() => { }}/>);
    fireEvent.click(screen.getByRole("button", { name: /Contas/ }));
    const texto = screen.getByText(longo, { selector: "span" });
    expect(texto.getAttribute("data-truncar")).toBe("duas-linhas");
    expect(texto.getAttribute("title")).toBe(longo);
});

it("alinharAoFim marca a lista para abrir alinhada ao fim do botão", () => {
    render(<SeletorMultiplo rotulo="Contas" alinharAoFim opcoes={[{ valor: "a", rotulo: "Principal" }]} selecionados={[]} aoMudar={() => { }}/>);
    fireEvent.click(screen.getByRole("button", { name: /Contas/ }));
    expect(screen.getByRole("group", { name: "Contas" }).getAttribute("data-alinhamento")).toBe("fim");
});
