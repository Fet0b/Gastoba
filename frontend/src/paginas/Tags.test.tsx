import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../api/cliente";
import type { Conta } from "../api/tipos";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { hojeLocal } from "../periodo/periodo";
import { entrarNaSimulacao } from "../simulacao/fetchSimulado";
import { Tags } from "./Tags";

beforeEach(() => {
  entrarNaSimulacao();
});

function navegacao(): Navegacao {
  return { nomeDaPessoa: "Você", tela: "tags", aoIrPara: vi.fn(), aoSair: vi.fn() };
}

async function gastar(tags: string[][], valorBase = 10): Promise<void> {
  const conta = await chamar<Conta>("/contas", {
    metodo: "POST",
    corpo: { nome: "Nubank", saldo_inicial: "0.00" },
  });
  for (const [i, t] of tags.entries()) {
    await chamar("/gastos", {
      metodo: "POST",
      corpo: {
        conta_id: conta.id,
        valor: `${valorBase + i}.00`,
        descricao: `Gasto ${i}`,
        data: hojeLocal(),
        categoria: "lazer",
        tags: t,
      },
    });
  }
}

const lista = () => screen.findByRole("list", { name: "Gastos por tag" });
const barra = (tag: string) => screen.findByRole("button", { name: new RegExp(`^${tag}: .*\\d+ gastos?$`) });

describe("Tags", () => {
  it("mostra as barras ordenadas por valor, com a contagem de gastos no nome", async () => {
    await gastar([["a"], ["b"], ["c"]]);
    render(<Tags navegacao={navegacao()} />);

    const itens = (await lista()).querySelectorAll(":scope > li");
    expect(Array.from(itens).map((li) => li.textContent?.slice(0, 1))).toEqual(["c", "b", "a"]);
    expect(await barra("c")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /^Pizza/ })).toBeNull();
  });

  it("o total do mês usa o ValorAnimado", async () => {
    await gastar([["a"], ["b"]]);
    render(<Tags navegacao={navegacao()} />);

    const grupo = await screen.findByRole("group", { name: "Total do mês em gastos" });
    expect(grupo.querySelector(".visualmente-oculto")?.textContent).toBe("R$\u{a0}21,00");
  });

  it("clicar numa barra abre o painel com os gastos da tag e o total", async () => {
    await gastar([["a"], ["b"], ["a", "b"]]);
    render(<Tags navegacao={navegacao()} />);

    fireEvent.click(await barra("a"));

    const painel = await screen.findByRole("region", { name: "a" });
    expect(screen.getByRole("status").textContent).toContain("a: ");
    await waitFor(() => expect(painel.querySelectorAll("li")).toHaveLength(2));
    expect(painel.textContent).toContain("Gasto 0");
    expect(painel.textContent).toContain("Gasto 2");
    expect(painel.textContent).not.toContain("Gasto 1");
    expect((await barra("a")).getAttribute("aria-pressed")).toBe("true");
  });

  it("clicar de novo, Esc e Fechar detalhe fecham o painel", async () => {
    await gastar([["a"], ["b"]]);
    render(<Tags navegacao={navegacao()} />);

    fireEvent.click(await barra("a"));
    await screen.findByRole("region", { name: "a" });
    fireEvent.click(await barra("a"));
    expect(screen.queryByRole("region", { name: "a" })).toBeNull();

    fireEvent.click(await barra("a"));
    await screen.findByRole("region", { name: "a" });
    fireEvent.keyDown(await barra("a"), { key: "Escape" });
    expect(screen.queryByRole("region", { name: "a" })).toBeNull();

    fireEvent.click(await barra("a"));
    fireEvent.click(await screen.findByRole("button", { name: "Fechar detalhe" }));
    expect(screen.queryByRole("region", { name: "a" })).toBeNull();
  });

  it("fixar mantém o foco na barra, anuncia na região de status e Fechar devolve o foco", async () => {
    await gastar([["a"], ["b"]]);
    render(<Tags navegacao={navegacao()} />);

    const botao = await barra("a");
    botao.focus();
    fireEvent.click(botao);
    await screen.findByRole("region", { name: "a" });
    expect(document.activeElement).toBe(botao);
    expect(screen.getByRole("status").textContent).toContain("a: ");
    expect(screen.getByRole("status").textContent).toContain("gastos estão abaixo");

    const fechar = screen.getByRole("button", { name: "Fechar detalhe" });
    fechar.focus();
    fireEvent.click(fechar);
    expect(document.activeElement).toBe(await barra("a"));
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("clicar em 'Sem tag' lista os gastos sem tag", async () => {
    await gastar([[], ["a"]]);
    render(<Tags navegacao={navegacao()} />);

    fireEvent.click(await screen.findByRole("button", { name: /^Sem tag: / }));

    const painel = await screen.findByRole("region", { name: "Sem tag" });
    await waitFor(() => expect(painel.querySelectorAll("li")).toHaveLength(1));
    expect(painel.textContent).toContain("Gasto 0");
  });

  it("uma tag de dentro de 'Outras' abre o mesmo painel", async () => {
    await gastar(Array.from({ length: 12 }, (_, i) => [`t${i}`]));
    render(<Tags navegacao={navegacao()} />);

    fireEvent.click(await screen.findByRole("button", { name: /^Outras \(4 tags\)/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^t0: / }));

    const painel = await screen.findByRole("region", { name: "t0" });
    await waitFor(() => expect(painel.querySelectorAll("li")).toHaveLength(1));
  });

  it("trocar de mês limpa a seleção quando a tag não existe no mês novo, sem erro", async () => {
    await gastar([["a"], ["b"]]);
    render(<Tags navegacao={navegacao()} />);
    fireEvent.click(await barra("a"));
    await screen.findByRole("region", { name: "a" });

    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));

    await waitFor(() => expect(screen.getByText("Sem gastos neste período")).toBeTruthy());
    expect(screen.queryByRole("region", { name: "a" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    // Voltar ao mês em que a tag existe não reabre o painel: a seleção foi mesmo limpa.
    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    await barra("a");
    expect(screen.queryByRole("region", { name: "a" })).toBeNull();
  });

  it("trocar de mês mantém a tag fixada quando ela existe no mês novo", async () => {
    await gastar([["a"], ["b"]]);
    const conta = (await chamar<Conta[]>("/contas"))[0];
    await chamar("/gastos", {
      metodo: "POST",
      corpo: {
        conta_id: conta.id,
        valor: "5.00",
        descricao: "Do mês passado",
        data: mesPassado(),
        categoria: "lazer",
        tags: ["a"],
      },
    });
    render(<Tags navegacao={navegacao()} />);
    fireEvent.click(await barra("a"));
    await screen.findByRole("region", { name: "a" });

    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));

    await waitFor(() => {
      const painel = screen.getByRole("region", { name: "a" });
      expect(painel.textContent).toContain("Do mês passado");
    });
    expect((await barra("a")).getAttribute("aria-pressed")).toBe("true");
  });

  it("mantém visível a frase da divisão em partes iguais", async () => {
    await gastar([["a"]]);
    render(<Tags navegacao={navegacao()} />);

    expect(await screen.findByText(/se divide em partes iguais entre elas/)).toBeTruthy();
  });

  it("sem gastos no mês mostra o estado vazio", async () => {
    render(<Tags navegacao={navegacao()} />);

    expect(await screen.findByText("Sem gastos neste período")).toBeTruthy();
  });
});

function mesPassado(): string {
  const [ano, mes] = hojeLocal().split("-").map(Number);
  const anterior = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  return `${anterior.ano}-${String(anterior.mes).padStart(2, "0")}-15`;
}
