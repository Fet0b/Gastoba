import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  expect(screen.getByText(/aguarda a sua confirmação/)).toBeTruthy();
});

const aporte = (extra: object) => ({ id: "m", conta_id: "c", data: "2026-10-03", valor: "100.00", descricao: "Aporte antigo", natureza: "outra", duplicado_sugerido_id: "d", tratamento_pendente_de_aprovacao: false, ...extra });
async function abrir(itens: object[]) {
  vi.stubGlobal("fetch", vi.fn(async (entrada: unknown) => String(entrada).endsWith("/aportes-sem-investimento") ? new Response(JSON.stringify(itens)) : new Response("[]")));
  render(<AportesSemInvestimento investimentos={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Revisar aportes" }));
  await screen.findByRole("listitem");
}

it("aporte de natureza 'outra' oferece Associar, Mesclar e Excluir, com o aviso de confirmação", async () => {
  await abrir([aporte({})]);
  expect(screen.queryByText("Só vale depois que você confirmar o tratamento.")).toBeNull();
  expect(screen.getByText(/Associe a uma posição ou, se for duplicado, registre o tratamento no menu/)).toBeTruthy();
  expect(screen.getByText("03/10/2026")).toBeTruthy();
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
  expect(screen.queryByText("Só vale depois que você confirmar o tratamento.")).toBeNull();
  expect(screen.queryByText(/Associe a uma posição/)).toBeNull();
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

it("tratamento registrado oferece Confirmar, com diálogo de foco em Cancelar, e Desfazer tratamento no menu", async () => {
  const fetch = vi.fn(async (entrada: unknown, opcoes?: RequestInit) => {
    if (opcoes?.method === "POST") return new Response(JSON.stringify({ id: "t", movimento_id: "m", acao: "excluido", aprovado: true }));
    if (String(entrada).endsWith("/aportes-sem-investimento")) return new Response(JSON.stringify([aporte({ duplicado_sugerido_id: null, tratamento_pendente_de_aprovacao: true })]));
    return new Response("[]");
  });
  vi.stubGlobal("fetch", fetch);
  render(<AportesSemInvestimento investimentos={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Revisar aportes" }));
  expect(await screen.findByText(/aguarda a sua confirmação/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar tratamento" }));

  const dialogo = await screen.findByRole("dialog", { name: "Confirmar o tratamento?" });
  expect(document.activeElement).toBe(within(dialogo).getByRole("button", { name: "Cancelar" }));
  expect(fetch.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(0);
  expect(dialogo.textContent).toMatch(/03\/10\/2026/);
  expect(dialogo.textContent).not.toMatch(/2026-10-03/);
  fireEvent.click(within(dialogo).getByRole("button", { name: "Confirmar" }));

  await waitFor(() => expect(fetch.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(1));
  expect(String(fetch.mock.calls.find(([, o]) => o?.method === "POST")![0])).toMatch(/\/aportes-sem-investimento\/m\/confirmar$/);
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Confirmar o tratamento?" })).toBeNull());
  fireEvent.click(await screen.findByRole("button", { name: /Mais ações do aporte/ }));
  expect(screen.getByRole("menuitem", { name: "Desfazer tratamento" })).toBeTruthy();
});

it("tratamento ainda não registrado não oferece Confirmar", async () => {
  await abrir([aporte({})]);
  expect(screen.queryByRole("button", { name: "Confirmar tratamento" })).toBeNull();
});

it("registrado na sessão, o diálogo de confirmar diz qual tratamento é e o botão o nomeia", async () => {
  vi.stubGlobal("fetch", vi.fn(async (entrada: unknown, opcoes?: RequestInit) => {
    if (opcoes?.method === "POST") return new Response(JSON.stringify({ id: "t", movimento_id: "m", acao: "excluido", aprovado: false }));
    return String(entrada).endsWith("/aportes-sem-investimento") ? new Response(JSON.stringify([aporte({})])) : new Response("[]");
  }));
  render(<AportesSemInvestimento investimentos={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Revisar aportes" }));
  fireEvent.click(await screen.findByRole("button", { name: /Mais ações do aporte/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Excluir" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar tratamento" }));
  const dialogo = await screen.findByRole("dialog", { name: "Confirmar o tratamento?" });
  expect(within(dialogo).getByRole("button", { name: "Confirmar exclusão" })).toBeTruthy();
  expect(dialogo.textContent).toMatch(/exclusão/);
});

it("sem saber qual tratamento foi registrado, o botão segue genérico", async () => {
  await abrir([aporte({ tratamento_pendente_de_aprovacao: true })]);
  fireEvent.click(screen.getByRole("button", { name: "Confirmar tratamento" }));
  const dialogo = await screen.findByRole("dialog", { name: "Confirmar o tratamento?" });
  expect(within(dialogo).getByRole("button", { name: "Confirmar" })).toBeTruthy();
});

it("o item com tratamento registrado põe o selo, a frase e o botão num bloco próprio, com o menu na grade", async () => {
  await abrir([aporte({ tratamento_pendente_de_aprovacao: true })]);
  const item = screen.getByRole("listitem");
  const bloco = screen.getByText("Tratamento registrado").closest("[data-bloco-do-tratamento]");
  expect(bloco).toBeTruthy();
  expect(bloco!.textContent).toMatch(/aguarda a sua confirmação/);
  expect(bloco!.querySelector("button")?.textContent).toBe("Confirmar tratamento");
  const menu = within(item).getByRole("button", { name: /Mais ações do aporte/ });
  expect(menu.closest("[data-bloco-do-tratamento]")).toBeNull();
});

it("durante a recarga da lista depois de tratar, o item continua e o nome do tratamento não se perde", async () => {
  let leituras = 0;
  let liberar: () => void = () => undefined;
  const segunda = new Promise<void>(resolver => { liberar = resolver; });
  vi.stubGlobal("fetch", vi.fn(async (entrada: unknown, opcoes?: RequestInit) => {
    if (opcoes?.method === "POST") return new Response(JSON.stringify({ id: "t", movimento_id: "m", acao: "excluido", aprovado: false }));
    if (!String(entrada).endsWith("/aportes-sem-investimento")) return new Response("[]");
    leituras += 1;
    if (leituras > 1) await segunda;
    return new Response(JSON.stringify([aporte({ tratamento_pendente_de_aprovacao: leituras > 1 })]));
  }));
  render(<AportesSemInvestimento investimentos={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Revisar aportes" }));
  fireEvent.click(await screen.findByRole("button", { name: /Mais ações do aporte/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Excluir" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
  await waitFor(() => expect(leituras).toBe(2));
  // A recarga ainda não terminou: a lista não vira esqueleto.
  expect(screen.getByText("Tratamento registrado")).toBeTruthy();
  expect(screen.queryByRole("status", { name: /Carregando aportes/ })).toBeNull();
  liberar();
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar tratamento" }));
  const dialogo = await screen.findByRole("dialog", { name: "Confirmar o tratamento?" });
  expect(within(dialogo).getByRole("button", { name: "Confirmar exclusão" })).toBeTruthy();
});
