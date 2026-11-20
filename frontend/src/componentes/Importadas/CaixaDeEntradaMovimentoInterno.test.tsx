import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";

import { chamar } from "../../api/cliente";
import type { Sincronizacao, TransacaoImportada } from "../../api/tipos";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { semearCasosDaCaixa } from "../../simulacao/manipuladores";
import { CaixaDeEntrada } from "./CaixaDeEntrada";

beforeEach(() => {
  entrarNaSimulacao();
  semearCasosDaCaixa();
});

const APLICACAO = "CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA";

async function abrirAsIgnoradas() {
  await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
  render(<CaixaDeEntrada aoAvisar={() => {}} aoSinalizarOlho={() => {}} />);
  await screen.findByRole("button", { name: "Sincronizar agora" });
  fireEvent.click(screen.getByRole("button", { name: "Ver ignoradas" }));
  return screen.findByRole("listitem", { name: "Aplicação automática" });
}

it("o movimento interno da conta fica fora da caixa de pendentes", async () => {
  await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
  const pendentes = await chamar<TransacaoImportada[]>("/transacoes-importadas");
  expect(pendentes.some((t) => t.descricao.startsWith("CONTA REMUNERADA"))).toBe(false);
  const ignoradas = await chamar<TransacaoImportada[]>("/transacoes-importadas", {
    parametros: { estado: "ignorada", motivo: "movimento_interno_da_conta" },
  });
  expect(ignoradas.map((t) => t.descricao).sort()).toEqual([
    APLICACAO,
    "CONTA REMUNERADA - RESGATE APLICAÇÃO",
  ]);
});

it("em Ver ignoradas ele traz o rótulo, a frase que explica e nenhuma ação de restaurar", async () => {
  const item = await abrirAsIgnoradas();
  expect(within(item).getByText("Movimento interno da conta")).toBeTruthy();
  expect(item.textContent).toMatch(/O banco aplica e resgata sozinho o saldo parado/);
  expect(item.textContent).toMatch(/Não precisa de ação/);
  expect(within(item).queryByRole("button", { name: /Desfazer classificação/ })).toBeNull();
  expect(within(item).queryByRole("button", { name: /Restaurar/ })).toBeNull();
});

it("o título é o rótulo próprio e a descrição do banco fica como apoio, com o texto inteiro no title", async () => {
  const item = await abrirAsIgnoradas();
  expect(within(item).getByRole("heading", { name: "Aplicação automática" })).toBeTruthy();
  const apoio = within(item).getByText(APLICACAO);
  expect(apoio.getAttribute("title")).toBe(APLICACAO);
  expect(item.querySelector("dialog")).toBeNull();
});

it("a entrada do movimento interno se chama Resgate automático", async () => {
  await abrirAsIgnoradas();
  expect(screen.getByRole("listitem", { name: "Resgate automático" })).toBeTruthy();
});

it("o vazio de Ver ignoradas não promete restaurar tudo", async () => {
  entrarNaSimulacao();
  render(<CaixaDeEntrada aoAvisar={() => {}} aoSinalizarOlho={() => {}} />);
  await screen.findByRole("button", { name: "Sincronizar agora" });
  fireEvent.click(screen.getByRole("button", { name: "Ver ignoradas" }));
  const vazio = await screen.findByText("Nenhuma transação ignorada");
  expect(vazio.parentElement?.textContent).not.toMatch(/e dá para restaurar\./);
  expect(vazio.parentElement?.textContent).toMatch(/exceto o movimento interno da conta/);
});

it("a simulação recusa restaurar e aceitar o movimento interno, como o servidor", async () => {
  await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
  const [espelho] = await chamar<TransacaoImportada[]>("/transacoes-importadas", {
    parametros: { estado: "ignorada", motivo: "movimento_interno_da_conta" },
  });
  await expect(
    chamar(`/transacoes-importadas/${espelho.id}/restaurar`, { metodo: "POST" }),
  ).rejects.toMatchObject({ codigo: "transacao_ja_tratada" });
  await expect(
    chamar(`/transacoes-importadas/${espelho.id}/aceitar`, {
      metodo: "POST",
      corpo: { categoria: "lazer", tags: [] },
    }),
  ).rejects.toMatchObject({ codigo: "transacao_ja_tratada" });
});
