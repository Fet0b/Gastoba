import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AportesSemInvestimento } from "./AportesSemInvestimento";

it("mostra prévia e só registra a exclusão depois de confirmar, sem aprovar totais", async () => {
  const fetch = vi.fn(async (entrada: unknown, opcoes?: RequestInit) => {
    if (opcoes?.method === "POST") return new Response(JSON.stringify({ id: "t", movimento_id: "m", acao: "excluido", aprovado: false }));
    if (String(entrada).endsWith("/aportes-sem-investimento")) return new Response(JSON.stringify([{ id: "m", conta_id: "c", data: "2026-10-03", valor: "100.00", duplicado_sugerido_id: null, tratamento_pendente_de_aprovacao: false }]));
    return new Response("[]");
  });
  vi.stubGlobal("fetch", fetch);
  render(<AportesSemInvestimento investimentos={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Revisar aportes" }));
  fireEvent.click(await screen.findByRole("button", { name: /Mais ações do aporte/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Excluir" }));
  expect(screen.getByText(/totais só mudam depois/)).toBeTruthy();
  expect(fetch.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
  await waitFor(() => expect(fetch.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(1));
  expect(screen.getByText(/aguarda aprovação/)).toBeTruthy();
});

const aporte = (extra: object) => ({ id: "m", conta_id: "c", data: "2026-10-03", valor: "100.00", descricao: "Aporte antigo", natureza: "outra", duplicado_sugerido_id: "d", tratamento_pendente_de_aprovacao: false, ...extra });
async function abrir(itens: object[]) {
  vi.stubGlobal("fetch", vi.fn(async (entrada: unknown) => String(entrada).endsWith("/aportes-sem-investimento") ? new Response(JSON.stringify(itens)) : new Response("[]")));
  render(<AportesSemInvestimento investimentos={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Revisar aportes" }));
  await screen.findByRole("listitem");
}

it("aporte de natureza 'outra' oferece Associar, Mesclar e Excluir, com o aviso de aprovação", async () => {
  await abrir([aporte({})]);
  expect(screen.getByText("Só vale depois da aprovação do relatório.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Mais ações do aporte/ }));
  expect(screen.getByRole("menuitem", { name: "Associar" })).toBeTruthy();
  expect(screen.getByRole("menuitem", { name: "Mesclar com duplicado" })).toBeTruthy();
  expect(screen.getByRole("menuitem", { name: "Excluir" })).toBeTruthy();
});

it.each(["liquidacao_de_bolsa", "imposto_ou_taxa"] as const)("aporte casável (%s) mostra rótulo e descrição e manda ligar na Revisão da bolsa", async (natureza) => {
  const descricao = natureza === "liquidacao_de_bolsa" ? "LIQ BOLSA - VISTA BRUTO - PREGÃO: 03/11/2026" : "LIQ BOLSA - VISTA TX CCP B3";
  await abrir([aporte({ natureza, descricao })]);
  expect(screen.getByText(natureza === "liquidacao_de_bolsa" ? "Liquidação da bolsa" : "Taxa da B3")).toBeTruthy();
  expect(screen.getByText(descricao)).toBeTruthy();
  expect(screen.getByText("Ligue na Revisão da bolsa.")).toBeTruthy();
  expect(screen.queryByText("Só vale depois da aprovação do relatório.")).toBeNull();
  expect(screen.queryByRole("button", { name: /Mais ações do aporte/ })).toBeNull();
});

it("aplicação automática da conta remunerada oferece só 'Ligar à conta investimentos'", async () => {
  await abrir([aporte({ natureza: "conta_remunerada", descricao: "CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA", duplicado_sugerido_id: null })]);
  expect(screen.getByText("Aplicação automática")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Mais ações do aporte/ }));
  expect(screen.getByRole("menuitem", { name: "Ligar à conta investimentos" })).toBeTruthy();
  expect(screen.queryByRole("menuitem", { name: "Excluir" })).toBeNull();
  expect(screen.queryByRole("menuitem", { name: /Mesclar/ })).toBeNull();
});
