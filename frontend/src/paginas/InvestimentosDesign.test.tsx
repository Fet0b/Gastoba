import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Investimentos } from "./Investimentos";
const nav = () => ({nomeDaPessoa:"Pessoa",tela:"investimentos" as const,gestaoDeInvestimentos:true,aoIrPara:vi.fn(),aoSair:vi.fn()});
function preparar(falhar=false) {
 vi.stubGlobal("fetch",async(url:RequestInfo|URL)=>{
  const p=new URL(String(url)).pathname;
  if(p.endsWith("/investimentos")) return falhar?new Response(JSON.stringify({erro:{codigo:"erro_interno",mensagem:"Sem resposta das posições."}}),{status:500}):new Response("[]");
  const dados=p.endsWith("/resumo")?{visao:"destinacao",total:"0.00",fatias:[],aportes_sem_destino:{quantidade:2,total:"50.00"}}:p.endsWith("/revisao-de-investimentos")?{aportes:[],gastos:[],recorrencias:[]}:[];
  return new Response(JSON.stringify(dados));
 });
}
it("mostra o banner mesmo sem posições, sem ação de definir destinações",async()=>{preparar();const navegacao=nav();render(<Investimentos navegacao={navegacao}/>);expect(await screen.findByText("2 aportes sem investimento")).toBeTruthy();expect(screen.getByText(/ainda não estão ligados/).textContent).toContain("50,00");expect(screen.queryByRole("button",{name:"Definir destinações"})).toBeNull();});
it("a primeira busca mostra esqueleto sem afirmar um total zero",()=>{vi.stubGlobal("fetch",()=>new Promise<Response>(()=>{}));render(<Investimentos navegacao={nav()}/>);expect(screen.getByRole("status",{name:"Carregando investimentos"})).toBeTruthy();expect(screen.queryByRole("region",{name:"Total investido"})).toBeNull();});
it("a falha das posições tem estado de erro em vez de carregamento infinito",async()=>{preparar(true);render(<Investimentos navegacao={nav()}/>);expect(await screen.findByText("Não foi possível carregar as posições.")).toBeTruthy();expect(screen.queryByRole("status",{name:"Carregando investimentos"})).toBeNull();});
