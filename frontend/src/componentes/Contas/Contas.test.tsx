import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../../api/cliente";
import { useContas } from "../../api/consultas";
import type { Conta } from "../../api/tipos";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { definirMidia } from "../../testes/preparar";
import { CartaoDeConta } from "./CartaoDeConta";
import { ListaDeContas } from "./ListaDeContas";

// Contra o fetch simulado (vazio e sem sessão a cada teste, pelo preparar.ts;
// aqui com a sessão aberta).
beforeEach(() => {
  entrarNaSimulacao();
});

const NBSP = "\u{a0}";

async function criarConta(nome: string, saldo_inicial?: string): Promise<Conta> {
  return chamar<Conta>("/contas", { metodo: "POST", corpo: { nome, saldo_inicial } });
}

type Espioes = {
  aoCriar?: (conta: Conta) => void;
  aoFalhar?: (erro: unknown) => void;
};

/** O Painel em miniatura: guarda a conta selecionada e o formulário aberto. */
function ComContas({ aoCriar = () => {}, aoFalhar = () => {} }: Espioes) {
  const { dados, carregando } = useContas();
  const [selecionada, definirSelecionada] = useState<string | null>(null);
  const [formularioAberto, definirFormularioAberto] = useState(false);
  return (
    <ListaDeContas
      contas={dados}
      carregando={carregando}
      contaSelecionada={selecionada}
      aoSelecionar={definirSelecionada}
      formularioAberto={formularioAberto}
      aoMudarFormulario={definirFormularioAberto}
      aoCriar={aoCriar}
      aoFalhar={aoFalhar}
    />
  );
}

function cartoes(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];
}

function abrirFormulario(): void {
  fireEvent.click(screen.getByRole("button", { name: "Nova conta" }));
}

function campo(rotulo: string): HTMLInputElement {
  return screen.getByLabelText(rotulo) as HTMLInputElement;
}

function descricaoDoErro(entrada: HTMLElement): string {
  const ids = entrada.getAttribute("aria-describedby") ?? "";
  return ids
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ")
    .trim();
}

describe("CartaoDeConta", () => {
  const conta: Conta = { id: "c1", nome: "Nubank", saldo: "100.00", origem: "manual", tipo: "corrente" };

  function pararAnimacoes(): void {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
  }

  it("destaca enquanto o saldo conta até o novo valor", () => {
    pararAnimacoes();
    const { container, rerender } = render(
      <CartaoDeConta conta={conta} selecionada={false} aoAlternar={() => {}} />,
    );
    expect(container.querySelector("[data-animando]")).toBeNull();

    rerender(
      <CartaoDeConta conta={{ ...conta, saldo: "74.10" }} selecionada={false} aoAlternar={() => {}} />,
    );

    expect(container.querySelector("button [data-animando]")).not.toBeNull();
    expect(container.textContent).toContain(`R$${NBSP}74,10`);
  });

  it("sem destaque com prefers-reduced-motion", () => {
    pararAnimacoes();
    definirMidia(true);
    const { container, rerender } = render(
      <CartaoDeConta conta={conta} selecionada={false} aoAlternar={() => {}} />,
    );

    rerender(
      <CartaoDeConta conta={{ ...conta, saldo: "74.10" }} selecionada={false} aoAlternar={() => {}} />,
    );

    expect(container.querySelector("[data-animando]")).toBeNull();
  });

  it("saldo negativo aparece com o sinal de menos", () => {
    const { container } = render(
      <CartaoDeConta conta={{ ...conta, saldo: "-10.00" }} selecionada aoAlternar={() => {}} />,
    );

    expect(container.textContent).toContain(`−R$${NBSP}10,00`);
    expect(container.querySelector("button")?.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("CartaoDeConta (tipo e origem)", () => {
  const base: Conta = { id: "c1", nome: "Nubank", saldo: "100.00", origem: "manual", tipo: "corrente" };

  it("mostra Cartão de crédito só para o tipo cartão", () => {
    const { container, rerender } = render(<CartaoDeConta conta={base} selecionada={false} />);
    expect(container.textContent).not.toContain("Cartão de crédito");

    rerender(<CartaoDeConta conta={{ ...base, tipo: "cartao" }} selecionada={false} />);
    expect(container.textContent).toContain("Cartão de crédito");
  });

  it("mostra Banco conectado para a conta open_finance", () => {
    const { container } = render(
      <CartaoDeConta conta={{ ...base, origem: "open_finance" }} selecionada={false} />,
    );
    expect(container.textContent).toContain("Banco conectado");
  });

  it("sem aoAlternar o cartão não é clicável", () => {
    const { container } = render(<CartaoDeConta conta={base} selecionada={false} />);
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("[aria-pressed]")).toBeNull();
    expect(container.textContent).toContain("Nubank");
  });
});

describe("CartaoDeConta (carteira)", () => {
  const base: Conta = { id: "c1", nome: "Nubank", saldo: "100.00", origem: "manual", tipo: "corrente" };

  it("selos em texto para banco conectado e cartão de crédito", () => {
    const { container } = render(
      <CartaoDeConta conta={{ ...base, origem: "open_finance", tipo: "cartao" }} selecionada={false} />,
    );
    const selos = [...container.querySelectorAll("[data-selo]")].map((selo) => selo.textContent);
    expect(selos).toEqual(["Cartão de crédito", "Banco conectado"]);
  });

  it("conta manual corrente não tem selos", () => {
    const { container } = render(<CartaoDeConta conta={base} selecionada={false} />);
    expect(container.querySelector("[data-selo]")).toBeNull();
  });

  it("saldo negativo traz o sinal, o ícone e o texto, nunca só a cor", () => {
    const { container } = render(<CartaoDeConta conta={{ ...base, saldo: "-10.00" }} selecionada={false} />);
    const cartao = container.querySelector("[data-tom]");
    expect(cartao?.getAttribute("data-tom")).toBe("negativo");
    expect(container.textContent).toContain(`\u{2212}R$${NBSP}10,00`);
    expect(container.textContent).toContain("Saldo negativo");
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("saldo zero é neutro, sem ícone nem texto de tom", () => {
    const { container } = render(<CartaoDeConta conta={{ ...base, saldo: "0.00" }} selecionada={false} />);
    expect(container.querySelector("[data-tom]")?.getAttribute("data-tom")).toBe("neutro");
    expect(container.textContent).toContain(`R$${NBSP}0,00`);
    expect(container.textContent).not.toContain("Saldo negativo");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("nome de 100 caracteres aparece inteiro", () => {
    const nome = "N".repeat(100);
    const { container } = render(<CartaoDeConta conta={{ ...base, nome }} selecionada={false} />);
    expect(container.textContent).toContain(nome);
  });
});

describe("ListaDeContas", () => {
  it("sem contas, o estado vazio traz a ação Nova conta, que abre o formulário", async () => {
    render(<ComContas />);
    await screen.findByText("Nenhuma conta ainda. Crie a primeira.");

    expect(screen.getAllByRole("button", { name: "Nova conta" })).toHaveLength(1);
    abrirFormulario();
    expect(campo("Nome")).toBeTruthy();
  });

  it("sem aoSelecionar a lista não tem botão de cartão nem aria-pressed", async () => {
    await criarConta("Nubank", "10.00");
    function Somente() {
      const { dados, carregando } = useContas();
      return (
        <ListaDeContas
          contas={dados}
          carregando={carregando}
          formularioAberto={false}
          aoMudarFormulario={() => {}}
          aoCriar={() => {}}
          aoFalhar={() => {}}
        />
      );
    }
    const { container } = render(<Somente />);

    await screen.findByText("Nubank");
    expect(container.querySelector("[aria-pressed]")).toBeNull();
    expect(container.querySelectorAll("li button")).toHaveLength(0);
  });

  it("lista as contas em ordem de nome com o saldo formatado", async () => {
    await criarConta("Nubank", "974.10");
    await criarConta("Carteira", "80.00");
    const { container } = render(<ComContas />);

    await waitFor(() => expect(cartoes(container)).toHaveLength(2));

    const [primeiro, segundo] = cartoes(container);
    expect(primeiro.textContent).toContain("Carteira");
    expect(primeiro.textContent).toContain(`R$${NBSP}80,00`);
    expect(segundo.textContent).toContain("Nubank");
    expect(segundo.textContent).toContain(`R$${NBSP}974,10`);
    expect(screen.getByRole("heading", { name: "Contas" })).not.toBeNull();
  });

  it("sem contas, mostra o estado vazio", async () => {
    render(<ComContas />);

    expect(await screen.findByText("Nenhuma conta ainda. Crie a primeira.")).not.toBeNull();
  });

  it("todos os campos do formulário são encontráveis pelo rótulo", async () => {
    render(<ComContas />);
    await screen.findByText("Nenhuma conta ainda. Crie a primeira.");

    abrirFormulario();

    expect(campo("Nome").tagName).toBe("INPUT");
    expect(campo("Saldo inicial").value).toBe("0,00");
    expect(campo("Saldo devedor").type).toBe("checkbox");
    expect(document.activeElement).toBe(campo("Nome"));
  });

  it("cria a conta com saldo inicial digitado como dígitos, e ela aparece na lista", async () => {
    const aoCriar = vi.fn();
    const { container } = render(<ComContas aoCriar={aoCriar} />);
    await screen.findByText("Nenhuma conta ainda. Crie a primeira.");

    abrirFormulario();
    fireEvent.change(campo("Nome"), { target: { value: "Nubank" } });
    fireEvent.change(campo("Saldo inicial"), { target: { value: "97410" } });
    expect(campo("Saldo inicial").value).toBe("974,10");
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() => expect(cartoes(container)).toHaveLength(1));
    expect(cartoes(container)[0].textContent).toContain(`R$${NBSP}974,10`);
    expect(aoCriar).toHaveBeenCalledWith(expect.objectContaining({ nome: "Nubank", saldo: "974.10" }));
    // No sucesso o formulário fecha.
    expect(screen.queryByLabelText("Nome")).toBeNull();
  });

  it("Saldo devedor envia o saldo inicial negativo", async () => {
    const espiao = vi.fn(fetch);
    vi.stubGlobal("fetch", espiao);
    const { container } = render(<ComContas />);
    await screen.findByText("Nenhuma conta ainda. Crie a primeira.");

    abrirFormulario();
    fireEvent.change(campo("Nome"), { target: { value: "Cartão" } });
    fireEvent.change(campo("Saldo inicial"), { target: { value: "5000" } });
    fireEvent.click(campo("Saldo devedor"));
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() => expect(cartoes(container)).toHaveLength(1));
    expect(cartoes(container)[0].textContent).toContain(`−R$${NBSP}50,00`);
    const envio = espiao.mock.calls.find(([, opcoes]) => opcoes?.method === "POST");
    expect(JSON.parse(String(envio?.[1]?.body))).toEqual({ nome: "Cartão", saldo_inicial: "-50.00" });
  });

  it("Saldo devedor com saldo zero envia zero, sem sinal", async () => {
    const espiao = vi.fn(fetch);
    vi.stubGlobal("fetch", espiao);
    const { container } = render(<ComContas />);
    await screen.findByText("Nenhuma conta ainda. Crie a primeira.");

    abrirFormulario();
    fireEvent.change(campo("Nome"), { target: { value: "Vazia" } });
    fireEvent.click(campo("Saldo devedor"));
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() => expect(cartoes(container)).toHaveLength(1));
    const envio = espiao.mock.calls.find(([, opcoes]) => opcoes?.method === "POST");
    expect(JSON.parse(String(envio?.[1]?.body))).toEqual({ nome: "Vazia", saldo_inicial: "0.00" });
  });

  it("nome repetido mostra a mensagem de conflito junto ao campo e mantém o formulário", async () => {
    await criarConta("Nubank");
    const aoFalhar = vi.fn();
    const { container } = render(<ComContas aoFalhar={aoFalhar} />);
    await waitFor(() => expect(cartoes(container)).toHaveLength(1));

    abrirFormulario();
    fireEvent.change(campo("Nome"), { target: { value: "Nubank" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() => expect(campo("Nome").getAttribute("aria-invalid")).toBe("true"));
    expect(descricaoDoErro(campo("Nome"))).toBe("Já existe uma conta com o nome 'Nubank'.");
    expect(campo("Saldo inicial").getAttribute("aria-invalid")).toBeNull();
    await waitFor(() => expect(aoFalhar).toHaveBeenCalledTimes(1));
    expect(cartoes(container)).toHaveLength(1);
  });

  it("nome vazio mostra a mensagem da API junto ao nome", async () => {
    render(<ComContas />);
    await screen.findByText("Nenhuma conta ainda. Crie a primeira.");

    abrirFormulario();
    fireEvent.change(campo("Nome"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() => expect(campo("Nome").getAttribute("aria-invalid")).toBe("true"));
    expect(descricaoDoErro(campo("Nome"))).toBe("O nome da conta não pode ser vazio.");
  });

  it("erro sem campo correspondente aparece no formulário como alerta", async () => {
    render(<ComContas />);
    await screen.findByText("Nenhuma conta ainda. Crie a primeira.");
    const corpo = { erro: { codigo: "erro_de_dominio", mensagem: "Regra violada." } };
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response(JSON.stringify(corpo), {
          status: 422,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    abrirFormulario();
    fireEvent.change(campo("Nome"), { target: { value: "Nubank" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toBe("Regra violada.");
    expect(campo("Nome").getAttribute("aria-invalid")).toBeNull();
  });

  it("servidor fora do ar avisa quem chamou, sem erro junto aos campos", async () => {
    const aoFalhar = vi.fn();
    render(<ComContas aoFalhar={aoFalhar} />);
    await screen.findByText("Nenhuma conta ainda. Crie a primeira.");
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));

    abrirFormulario();
    fireEvent.change(campo("Nome"), { target: { value: "Nubank" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() => expect(aoFalhar).toHaveBeenCalledTimes(1));
    expect(aoFalhar.mock.calls[0][0]).toMatchObject({ codigo: "sem_resposta" });
    expect(campo("Nome").getAttribute("aria-invalid")).toBeNull();
  });

  it("Cancelar fecha o formulário e devolve o foco ao botão Nova conta", async () => {
    render(<ComContas />);
    await screen.findByText("Nenhuma conta ainda. Crie a primeira.");

    abrirFormulario();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByLabelText("Nome")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Nova conta" }));
  });

  it("clicar no cartão seleciona a conta e clicar de novo limpa", async () => {
    await criarConta("Nubank");
    const { container } = render(<ComContas />);
    await waitFor(() => expect(cartoes(container)).toHaveLength(1));

    const [cartao] = cartoes(container);
    expect(cartao.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(cartao);
    expect(cartoes(container)[0].getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(cartoes(container)[0]);
    expect(cartoes(container)[0].getAttribute("aria-pressed")).toBe("false");
  });
});
