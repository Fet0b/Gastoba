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
    expect(container.querySelectorAll("[data-selo] [data-badge]")).toHaveLength(2);
  });

  it("conta manual corrente não tem selos", () => {
    const { container } = render(<CartaoDeConta conta={base} selecionada={false} />);
    expect(container.querySelector("[data-selo]")).toBeNull();
  });

  it("conta corrente negativa traz o sinal, o Badge com ícone e o texto, nunca só a cor", () => {
    const { container } = render(<CartaoDeConta conta={{ ...base, saldo: "-10.00" }} selecionada={false} />);
    const cartao = container.querySelector("[data-tom]");
    expect(cartao?.getAttribute("data-tom")).toBe("negativo");
    expect(container.textContent).toContain(`\u{2212}R$${NBSP}10,00`);
    const badge = container.querySelector("[data-badge]");
    expect(badge?.textContent).toBe("Saldo negativo");
    expect(badge?.getAttribute("data-tom")).toBe("negativo");
    expect(badge?.querySelector("svg")).not.toBeNull();
  });

  it("cartão de crédito mostra Fatura aberta positiva e neutra, sem Saldo negativo", () => {
    const { container } = render(
      <CartaoDeConta conta={{ ...base, tipo: "cartao", saldo: "-122.18" }} selecionada={false} />,
    );
    expect(container.textContent).toContain("Fatura aberta");
    expect(container.textContent).toContain(`R$${NBSP}122,18`);
    expect(container.textContent).not.toContain(`\u{2212}R$`);
    expect(container.querySelector('[data-tom="negativo"]')).toBeNull();
    expect(container.textContent).not.toContain("Saldo negativo");
  });

  it("o rótulo do cartão acompanha a situação da fatura mais recente, sempre neutro", () => {
    const cartao = { ...base, tipo: "cartao" as const, saldo: "-122.18" };
    const { container, rerender } = render(
      <CartaoDeConta conta={cartao} selecionada={false} situacaoDoCartao={{ recente: "fechada", temVencida: false }} />,
    );
    expect(container.textContent).toContain("Fatura fechada");
    expect(container.querySelector('[data-tom="negativo"]')).toBeNull();
    rerender(
      <CartaoDeConta conta={cartao} selecionada={false} situacaoDoCartao={{ recente: null, temVencida: false }} />,
    );
    expect(container.textContent).toContain("Fatura aberta");
  });

  it("mostra o selo 'Vencida', com texto e tom negativo, só no cartão com fatura vencida", () => {
    const cartao = { ...base, tipo: "cartao" as const, saldo: "-122.18" };
    const { container, rerender } = render(
      <CartaoDeConta conta={cartao} selecionada={false} situacaoDoCartao={{ recente: "fechada", temVencida: true }} />,
    );
    const selo = container.querySelector('[data-selo="vencida"] [data-badge]');
    expect(selo?.textContent).toBe("Vencida");
    expect(selo?.getAttribute("data-tom")).toBe("negativo");
    expect(container.textContent).not.toContain("Saldo negativo");

    rerender(
      <CartaoDeConta conta={cartao} selecionada={false} situacaoDoCartao={{ recente: "aberta", temVencida: false }} />,
    );
    expect(container.querySelector('[data-selo="vencida"]')).toBeNull();
    rerender(<CartaoDeConta conta={cartao} selecionada={false} />);
    expect(container.querySelector('[data-selo="vencida"]')).toBeNull();
  });

  it("conta corrente nunca leva o selo 'Vencida'", () => {
    const { container } = render(
      <CartaoDeConta conta={base} selecionada={false} situacaoDoCartao={{ recente: "fechada", temVencida: true }} />,
    );
    expect(container.querySelector('[data-selo="vencida"]')).toBeNull();
  });

  it("cartão de crédito com crédito a favor mostra Saldo a favor", () => {
    const { container } = render(
      <CartaoDeConta conta={{ ...base, tipo: "cartao", saldo: "50.00" }} selecionada={false} />,
    );
    expect(container.textContent).toContain("Saldo a favor");
  });

  it("conta corrente rotula o valor como Saldo", () => {
    const { container } = render(<CartaoDeConta conta={base} selecionada={false} />);
    expect(container.textContent).toContain("Saldo");
  });

  it("saldo zero é neutro, sem Badge nem texto de tom", () => {
    const { container } = render(<CartaoDeConta conta={{ ...base, saldo: "0.00" }} selecionada={false} />);
    expect(container.querySelector("[data-tom]")?.getAttribute("data-tom")).toBe("neutro");
    expect(container.textContent).toContain(`R$${NBSP}0,00`);
    expect(container.textContent).not.toContain("Saldo negativo");
    expect(container.querySelector("[data-badge]")).toBeNull();
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
    await screen.findByText("Nenhuma conta ainda");

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
    expect(screen.getByRole("heading", { name: "Suas contas" })).not.toBeNull();
  });

  it("sem contas, mostra o estado vazio", async () => {
    render(<ComContas />);

    expect(await screen.findByText("Nenhuma conta ainda")).not.toBeNull();
  });

  it("todos os campos do formulário são encontráveis pelo rótulo", async () => {
    render(<ComContas />);
    await screen.findByText("Nenhuma conta ainda");

    abrirFormulario();

    expect(campo("Nome").tagName).toBe("INPUT");
    expect(campo("Saldo inicial").value).toBe("0,00");
    expect(campo("Saldo devedor").type).toBe("checkbox");
    expect(document.activeElement).toBe(campo("Nome"));
  });

  it("cria a conta com saldo inicial digitado como dígitos, e ela aparece na lista", async () => {
    const aoCriar = vi.fn();
    const { container } = render(<ComContas aoCriar={aoCriar} />);
    await screen.findByText("Nenhuma conta ainda");

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
    await screen.findByText("Nenhuma conta ainda");

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
    await screen.findByText("Nenhuma conta ainda");

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
    await screen.findByText("Nenhuma conta ainda");

    abrirFormulario();
    fireEvent.change(campo("Nome"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() => expect(campo("Nome").getAttribute("aria-invalid")).toBe("true"));
    expect(descricaoDoErro(campo("Nome"))).toBe("O nome da conta não pode ser vazio.");
  });

  it("erro sem campo correspondente aparece no formulário como alerta", async () => {
    render(<ComContas />);
    await screen.findByText("Nenhuma conta ainda");
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
    await screen.findByText("Nenhuma conta ainda");
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
    await screen.findByText("Nenhuma conta ainda");

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

  it("o botão Nova conta é secundário e tem ícone, sem o + textual", async () => {
    await criarConta("Nubank");
    const { container } = render(<ComContas />);
    await waitFor(() => expect(cartoes(container)).toHaveLength(1));

    const botao = screen.getByRole("button", { name: "Nova conta" });
    expect(botao.getAttribute("data-papel")).toBe("secundaria");
    expect(botao.textContent).toBe("Nova conta");
    expect(botao.querySelector("svg")).not.toBeNull();
  });
});

describe("ListaDeContas (excluir pelo menu)", () => {
  function ComExclusao({ aoExcluir }: { aoExcluir: (conta: Conta) => Promise<boolean> }) {
    const { dados, carregando } = useContas();
    return (
      <ListaDeContas
        contas={dados}
        carregando={carregando}
        aoSelecionar={() => {}}
        formularioAberto={false}
        aoMudarFormulario={() => {}}
        aoCriar={() => {}}
        aoFalhar={() => {}}
        aoExcluir={aoExcluir}
      />
    );
  }

  it("nenhum Excluir fica visível; o menu da conta abre o diálogo de confirmação", async () => {
    await criarConta("Nubank", "10.00");
    const aoExcluir = vi.fn(async () => true);
    render(<ComExclusao aoExcluir={aoExcluir} />);
    await screen.findByText("Nubank");

    expect(screen.queryByRole("button", { name: /^Excluir/ })).toBeNull();
    const gatilho = screen.getByRole("button", { name: "Mais ações da conta Nubank" });
    fireEvent.click(gatilho);
    fireEvent.click(screen.getByRole("menuitem", { name: "Excluir a conta Nubank" }));

    const dialogo = await screen.findByRole("dialog", { name: /Excluir a conta Nubank/ });
    expect(dialogo.textContent).toContain("Os gastos, ganhos e recorrências dela também serão apagados.");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));

    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
    await waitFor(() => expect(aoExcluir).toHaveBeenCalledTimes(1));
  });

  it("cancelar devolve o foco ao gatilho do menu", async () => {
    await criarConta("Nubank");
    render(<ComExclusao aoExcluir={async () => true} />);
    await screen.findByText("Nubank");

    const gatilho = screen.getByRole("button", { name: "Mais ações da conta Nubank" });
    fireEvent.click(gatilho);
    fireEvent.click(screen.getByRole("menuitem", { name: "Excluir a conta Nubank" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(document.activeElement).toBe(gatilho));
  });

  it("o menu é irmão do cartão, nunca aninhado no botão do filtro", async () => {
    await criarConta("Nubank");
    const { container } = render(<ComExclusao aoExcluir={async () => true} />);
    await screen.findByText("Nubank");

    const gatilho = screen.getByRole("button", { name: "Mais ações da conta Nubank" });
    expect(gatilho.closest("button[aria-pressed]")).toBeNull();
    expect(container.querySelectorAll("li")).toHaveLength(1);
  });

  it("conta importada do banco não tem menu", async () => {
    await chamar("/sincronizacoes", { metodo: "POST" });
    render(<ComExclusao aoExcluir={async () => true} />);
    await screen.findByText("Visa Gold");

    expect(screen.queryByRole("button", { name: /Mais ações da conta/ })).toBeNull();
  });
});
