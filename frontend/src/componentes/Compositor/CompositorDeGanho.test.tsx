import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../../api/cliente";
import { useCategorias, useContas, useTags } from "../../api/consultas";
import type { Conta, Ganho } from "../../api/tipos";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { CompositorDeGasto } from "./CompositorDeGasto";

// O compositor em modo "Ganho", contra o fetch simulado (vazio a cada teste, com a sessão aberta).
beforeEach(() => {
  entrarNaSimulacao();
});

async function criarConta(nome: string, saldo_inicial = "100.00"): Promise<Conta> {
  return chamar<Conta>("/contas", { metodo: "POST", corpo: { nome, saldo_inicial } });
}

function ComCompositor({
  aoRegistrar = () => {},
  aoRegistrarGanho = () => {},
}: {
  aoRegistrar?: () => void;
  aoRegistrarGanho?: (ganho: Ganho) => void;
}) {
  const contas = useContas();
  const categorias = useCategorias();
  const tags = useTags();
  const [aberto, definirAberto] = useState(true);
  if (!aberto || !contas.dados) return null;
  return (
    <CompositorDeGasto
      contas={contas.dados}
      categorias={categorias.dados}
      sugestoesDeTags={tags.dados ?? []}
      contaInicial={null}
      aoRegistrar={aoRegistrar}
      aoRegistrarGanho={aoRegistrarGanho}
      aoFalhar={() => {}}
      aoFechar={() => definirAberto(false)}
    />
  );
}

const campo = (rotulo: string) => screen.getByLabelText(rotulo) as HTMLInputElement;

async function abrirComoGanho(): Promise<void> {
  await screen.findByRole("dialog", { name: "Novo gasto" });
  await screen.findByLabelText("Conforto");
  fireEvent.click(screen.getByRole("button", { name: "Ganho" }));
}

describe("CompositorDeGasto em modo ganho", () => {
  it("abre em Gasto e o seletor troca o título, esconde a categoria e muda o botão", async () => {
    await criarConta("Nubank");
    render(<ComCompositor />);
    await screen.findByRole("dialog", { name: "Novo gasto" });
    await screen.findByLabelText("Conforto");
    expect(screen.getByRole("button", { name: "Gasto" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Ganho" }));

    expect(screen.getByRole("dialog", { name: "Novo ganho" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ganho" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("radiogroup", { name: "Categoria" })).toBeNull();
    expect(screen.getByRole("button", { name: "Registrar ganho" })).toBeTruthy();
  });

  it("o botão fica desabilitado, com os motivos, até haver valor e descrição (sem pedir categoria)", async () => {
    await criarConta("Nubank");
    render(<ComCompositor />);
    await abrirComoGanho();

    const botao = screen.getByRole("button", { name: "Registrar ganho" }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(screen.queryByText("Escolha uma categoria.")).toBeNull();
    expect(screen.getByText("Informe um valor maior que zero.")).toBeTruthy();

    fireEvent.change(campo("Valor"), { target: { value: "500000" } });
    fireEvent.change(campo("Descrição"), { target: { value: "Salário" } });

    expect(botao.disabled).toBe(false);
  });

  it("registra o ganho, credita a conta e avisa com o ganho registrado", async () => {
    const conta = await criarConta("Nubank", "100.00");
    const aoRegistrarGanho = vi.fn();
    const aoRegistrar = vi.fn();
    render(<ComCompositor aoRegistrar={aoRegistrar} aoRegistrarGanho={aoRegistrarGanho} />);
    await abrirComoGanho();

    fireEvent.change(campo("Valor"), { target: { value: "500000" } });
    fireEvent.change(campo("Descrição"), { target: { value: "Salário" } });
    fireEvent.change(campo("Tags"), { target: { value: "Pix" } });
    fireEvent.keyDown(campo("Tags"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Registrar ganho" }));

    await waitFor(() => expect(aoRegistrarGanho).toHaveBeenCalledTimes(1));
    expect(aoRegistrar).not.toHaveBeenCalled();
    const ganho = aoRegistrarGanho.mock.calls[0][0] as Ganho;
    expect(ganho).toMatchObject({
      conta_id: conta.id,
      valor: "5000.00",
      descricao: "Salário",
      tags: ["pix"],
    });
    const contas = await chamar<Conta[]>("/contas");
    expect(contas[0].saldo).toBe("5100.00");
    const ganhos = await chamar<Ganho[]>("/ganhos", {
      parametros: { inicio: "2000-01-01", fim: "2999-12-31" },
    });
    expect(ganhos).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("valor acima do limite mostra o erro no campo Valor e continua aberto", async () => {
    await criarConta("Nubank", "999999999999.99");
    render(<ComCompositor />);
    await abrirComoGanho();

    fireEvent.change(campo("Valor"), { target: { value: "1000" } });
    fireEvent.change(campo("Descrição"), { target: { value: "Prêmio" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar ganho" }));

    await waitFor(() => expect(campo("Valor").getAttribute("aria-invalid")).toBe("true"));
    expect(screen.getByRole("dialog", { name: "Novo ganho" })).toBeTruthy();
  });
});
