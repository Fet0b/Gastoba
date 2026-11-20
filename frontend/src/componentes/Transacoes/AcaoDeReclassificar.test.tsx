import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { chamar } from "../../api/cliente";
import type { Ganho, Investimento } from "../../api/tipos";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { adicionarInvestimentoSimulado } from "../../simulacao/manipuladores";
import { MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";
import { useAcaoDeReclassificar } from "./AcaoDeReclassificar";

beforeEach(() => entrarNaSimulacao());
afterEach(cleanup);

function Teste({ transacaoId, sentido, aoConcluir = () => undefined }: { transacaoId: string | null; sentido: "saida" | "entrada"; aoConcluir?: () => void }) {
  const acao = useAcaoDeReclassificar(transacaoId, "Credito CDB", sentido, aoConcluir);
  return <div>{acao.item && <MenuDeAcoes rotulo="Mais ações" itens={[acao.item]} />}{acao.dialogo}</div>;
}

async function prepararRendimento() {
  adicionarInvestimentoSimulado({ nome: "CDB exemplo", tipo: "FIXED_INCOME", saldo: "100.00" });
  await chamar("/sincronizacoes", { metodo: "POST" });
  const caixa = await chamar<{ id: string; descricao: string; sentido: string }[]>("/transacoes-importadas");
  const entrada = caixa.find(t => t.sentido === "entrada")!;
  await chamar(`/transacoes-importadas/${entrada.id}/aceitar`, { metodo: "POST", corpo: { tags: [] } });
  const investimentos = await chamar<Investimento[]>("/investimentos");
  return { entrada, investimento: investimentos.find(i => i.nome === "CDB exemplo")! };
}

function abrir() {
  fireEvent.click(screen.getByRole("button", { name: /Mais ações/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Reclassificar" }));
}

describe("AcaoDeReclassificar", () => {
  it("não oferece a ação sem transação importada", () => {
    render(<Teste transacaoId={null} sentido="entrada" />);
    expect(screen.queryByRole("button", { name: /Mais ações/ })).toBeNull();
  });

  it("explica para que serve e só habilita depois de escolher o investimento", async () => {
    const { entrada } = await prepararRendimento();
    render(<Teste transacaoId={entrada.id} sentido="entrada" />);
    abrir();
    const dialogo = await screen.findByRole("dialog", { name: /Reclassificar/ });
    expect(dialogo.textContent).toContain("a classificação atual é desfeita");
    fireEvent.change(screen.getByLabelText("Nova classificação"), { target: { value: "rendimento_da_posicao" } });
    const confirmar = screen.getByRole("button", { name: "Reclassificar" }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
    expect(dialogo.textContent).toContain("Escolha o investimento para continuar.");
  });

  it("reclassifica o rendimento aceito como ganho: sai da renda e vira rendimento da posição", async () => {
    const { entrada, investimento } = await prepararRendimento();
    const concluiu = { valor: false };
    render(<Teste transacaoId={entrada.id} sentido="entrada" aoConcluir={() => { concluiu.valor = true; }} />);
    abrir();
    await screen.findByRole("dialog", { name: /Reclassificar/ });
    fireEvent.change(screen.getByLabelText("Nova classificação"), { target: { value: "rendimento_da_posicao" } });
    fireEvent.change(screen.getByLabelText("Investimento"), { target: { value: investimento.id } });
    fireEvent.click(screen.getByRole("button", { name: "Reclassificar" }));
    await waitFor(() => expect(concluiu.valor).toBe(true));
    const ganhos = await chamar<Ganho[]>("/ganhos", { parametros: { inicio: "2000-01-01", fim: "2100-01-01" } });
    expect(ganhos.some(g => g.transacao_importada_id === entrada.id)).toBe(false);
  });

  it("mostra a mensagem da API junto ao diálogo e não perde a classificação", async () => {
    const { entrada } = await prepararRendimento();
    render(<Teste transacaoId={entrada.id} sentido="entrada" />);
    abrir();
    await screen.findByRole("dialog", { name: /Reclassificar/ });
    // Versão velha de propósito: a API recusa e nada muda.
    await chamar(`/transacoes-importadas/${entrada.id}/desfazer-classificacao`, { metodo: "POST", corpo: { desfazer_divisao_inteira: false } });
    fireEvent.change(screen.getByLabelText("Nova classificação"), { target: { value: "transferencia_para_investimento" } });
    fireEvent.click(screen.getByRole("button", { name: "Reclassificar" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });

  it("devolve o foco ao acionador ao cancelar", async () => {
    const { entrada } = await prepararRendimento();
    render(<Teste transacaoId={entrada.id} sentido="entrada" />);
    const menu = screen.getByRole("button", { name: /Mais ações/ });
    abrir();
    await screen.findByRole("dialog", { name: /Reclassificar/ });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(document.activeElement).toBe(menu));
  });
});

it("oferece imposto e custo e exige posição e operação relacionada", async () => {
  const { entrada, investimento } = await prepararRendimento();
  render(<Teste transacaoId={entrada.id} sentido="saida" />);
  abrir();
  await screen.findByRole("dialog", { name: /Reclassificar/ });
  fireEvent.change(screen.getByLabelText("Nova classificação"), { target: { value: "imposto" } });
  fireEvent.change(screen.getByLabelText("Investimento"), { target: { value: investimento.id } });
  expect((screen.getByRole("button", { name: "Reclassificar" }) as HTMLButtonElement).disabled).toBe(true);
  expect((await screen.findByLabelText("Operação relacionada") as HTMLSelectElement).value).toBe("");
});
