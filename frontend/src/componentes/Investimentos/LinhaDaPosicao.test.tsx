import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Investimento } from "../../api/tipos";
import { LinhaDaPosicao } from "./LinhaDaPosicao";
const investimento:Investimento={id:"i",nome:"CDB - BANCO BTG PACTUAL S.A.",tipo:"FIXED_INCOME",subtipo:"CDB",saldo:"110.00",valor_aplicado:"100.00",rendimento:"10.00",rentabilidade:"10.00",origem_da_rentabilidade:"instituicao",taxa:null,atualizado_em:null,destinacoes:[{tag:"viagem",principal:"100.00",valor_atual:"110.00",rendimento:"10.00",rentabilidade:"10.00",cor:null}]};
it("mantém detalhes recolhidos e só consulta realocações pelo menu",async()=>{const fetch=vi.fn(async()=>new Response("[]"));vi.stubGlobal("fetch",fetch);render(<ul><LinhaDaPosicao investimento={investimento} aoAvisar={vi.fn()} aoFalhar={vi.fn()}/></ul>);expect(screen.getByText("CDB BTG Pactual")).toBeTruthy();expect(screen.queryByRole("table")).toBeNull();expect(fetch).not.toHaveBeenCalled();const menu=screen.getByRole("button",{name:/Mais ações/});menu.focus();fireEvent.click(menu);fireEvent.click(screen.getByRole("menuitem",{name:"Ver realocações"}));await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));expect(await screen.findByText("Nenhuma realocação ainda.")).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Concluir"}));expect(document.activeElement).toBe(menu);});
it("abre o detalhe das destinações em diálogo",()=>{render(<ul><LinhaDaPosicao investimento={investimento} aoAvisar={vi.fn()} aoFalhar={vi.fn()}/></ul>);fireEvent.click(screen.getByRole("button",{name:/Mais ações/}));fireEvent.click(screen.getByRole("menuitem",{name:"Ver destinações e cores"}));expect(screen.getByRole("dialog",{name:/Destinações/})).toBeTruthy();expect(screen.getByRole("table")).toBeTruthy();});

const incompleta = (acao: Investimento["acao_do_historico"]): Investimento => ({ ...investimento, tipo: "EQUITY", subtipo: null, historico_completo: false, acao_do_historico: acao, pendencias: [{ tipo: "faltam_cotas", quantidade_estimada: "2" }] });
const mostrar = (i: Investimento) => { vi.stubGlobal("fetch", vi.fn(async () => new Response("[]"))); render(<ul><LinhaDaPosicao investimento={i} aoAvisar={vi.fn()} aoFalhar={vi.fn()} /></ul>); };

it("'Confirmar quantidade' abre as operações sem o formulário de lançar", async () => {
  mostrar(incompleta("confirmar_quantidade"));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar quantidade" }));
  expect(await screen.findByRole("dialog", { name: /Operações de/ })).toBeTruthy();
  expect(screen.queryByRole("combobox", { name: "Tipo de operação" })).toBeNull();
});
it("'Completar histórico' abre o formulário de lançar", async () => {
  mostrar(incompleta("completar"));
  fireEvent.click(screen.getByRole("button", { name: "Completar histórico" }));
  expect(await screen.findByRole("combobox", { name: "Tipo de operação" })).toBeTruthy();
});
it("'Conferir operações' abre as operações", async () => {
  mostrar(incompleta("conferir_operacoes"));
  fireEvent.click(screen.getByRole("button", { name: "Conferir operações" }));
  expect(await screen.findByRole("dialog", { name: /Operações de/ })).toBeTruthy();
  expect(screen.queryByRole("combobox", { name: "Tipo de operação" })).toBeNull();
});
it("sem ação do histórico não há botão no aviso", () => {
  mostrar(incompleta(null));
  expect(screen.queryByRole("button", { name: /Confirmar quantidade|Completar histórico|Conferir operações/ })).toBeNull();
});
