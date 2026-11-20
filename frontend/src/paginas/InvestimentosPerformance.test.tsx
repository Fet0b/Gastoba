import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Investimentos } from "./Investimentos";
import type { Investimento } from "../api/tipos";

const posicao: Investimento = {id:"i0",nome:"Título fictício",tipo:"FIXED_INCOME",subtipo:"CDB",saldo:"100.00",valor_aplicado:null,rendimento:null,rentabilidade:null,origem_da_rentabilidade:null,taxa:null,atualizado_em:"2026-11-08",destinacoes:[]};
const nav = {nomeDaPessoa:"Pessoa",tela:"investimentos" as const,importacaoBancaria:true,gestaoDeInvestimentos:true,aoIrPara:vi.fn(),aoSair:vi.fn()};

it.each([0,9])("não faz N+1 com 76 posições e %s revisões; busca realocações só ao expandir", async (pendentes) => {
 const pedidos:string[] = [];
 const lista = Array.from({length:76},(_,i)=>({...posicao,id:`i${i}`,nome:`Título ${i}`}));
 let concluir!: (r:Response)=>void;
 vi.stubGlobal("fetch", async (url:RequestInfo|URL) => {
  const caminho = new URL(String(url)).pathname; pedidos.push(caminho);
  if(caminho.endsWith("/historico")) return await new Promise<Response>(r=>{concluir=r;});
  const corpo = caminho.endsWith("/investimentos") ? lista
   : caminho.endsWith("/resumo") ? {visao:"destinacao",total:"7600.00",fatias:[{rotulo:null,valor:"7600.00",cor:null}]}
   : caminho.endsWith("/revisao-de-investimentos") ? {aportes:Array.from({length:pendentes},(_,i)=>({id:`m${i}`,tipo:"aporte",descricao:`Aporte ${i}`,valor:"100.00",investimento_id:null})),gastos:[],recorrencias:[]}
   : [];
  return new Response(JSON.stringify(corpo));
 });
 render(<Investimentos navegacao={nav} />);
 await screen.findByRole("listitem",{name:"Título 75"});
 expect(pedidos.filter(p=>p.endsWith("/realocacoes"))).toHaveLength(0);
 expect(pedidos.length).toBeLessThanOrEqual(10);
 expect(screen.getByText("Carregando saldos…")).toBeTruthy();
 expect(screen.queryByText(/Ainda não há saldos guardados/)).toBeNull();
 const pontos = pendentes === 0 ? [] : Array.from({length:1413},(_,i)=>({investimento_id:`i${i%76}`,data:`2026-11-${String(Math.floor(i/76)+1).padStart(2,"0")}`,saldo:"100.00"}));
 await act(async()=>concluir(new Response(JSON.stringify(pontos))));
 if (pontos.length === 0) expect(await screen.findByText(/Ainda não há saldos guardados/)).toBeTruthy();
 else {
  expect(screen.queryByText(/Ainda não há saldos guardados/)).toBeNull();
  expect(screen.queryByText("Carregando saldos…")).toBeNull();
 }
 const linha=screen.getByRole("listitem",{name:"Título 0"});
 function abrirHistorico(){fireEvent.click(within(linha).getByRole("button",{name:/Mais ações/}));fireEvent.click(screen.getByRole("menuitem",{name:"Ver realocações"}));}
 abrirHistorico();
 await waitFor(()=>expect(pedidos.filter(p=>p.endsWith("/realocacoes"))).toHaveLength(1));
 expect(await screen.findByText("Nenhuma realocação ainda")).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Concluir"}));
 abrirHistorico();
 expect(pedidos.filter(p=>p.endsWith("/realocacoes"))).toHaveLength(1);
});
