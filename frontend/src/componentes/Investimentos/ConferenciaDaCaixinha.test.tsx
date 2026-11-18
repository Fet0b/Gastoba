import { StrictMode } from "react";
import { invalidar } from "../../api/useConsulta";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Conta, Investimento } from "../../api/tipos";
import { ConferenciaDaCaixinha } from "./ConferenciaDaCaixinha";

const conta = (id="c1", tipo:Conta["tipo"]="remunerada"):Conta => ({id,nome:`Conta ${id}`,saldo:"1500.00",origem:"open_finance",tipo});
const posicao = (id="i1", conta_id="c1"):Investimento => ({id,conta_id,nome:"Conta investimentos",tipo:"CAIXINHA",subtipo:null,saldo:"962.17",valor_aplicado:null,rendimento:null,rentabilidade:null,origem_da_rentabilidade:null,taxa:null,atualizado_em:"2026-11-08",destinacoes:[]});
function preparar(contas=[conta()], resultado:Record<string,unknown>={}, falhar=false) {
 const enviados:{caminho:string;corpo:Record<string,unknown>}[]=[];
 vi.stubGlobal("fetch",async (url:RequestInfo|URL, opcoes?:RequestInit)=>{
  const caminho=String(url);
  if(opcoes?.method==="POST"||opcoes?.method==="PUT"){
   enviados.push({caminho,corpo:JSON.parse(String(opcoes.body))});
   if(falhar)return new Response(JSON.stringify({erro:{codigo:"referencia_invalida",mensagem:"Confira a data do extrato."}}),{status:422});
  }
  if(caminho.endsWith("/contas"))return new Response(JSON.stringify(contas));
  if(caminho.endsWith("/caixinhas"))return new Response(JSON.stringify(posicao()));
  return new Response(JSON.stringify({saldo_inicial:"0.00",saldo_observado:"962.17",saldo_calculado:"962.17",diferenca:"0.00",completo:true,conciliado:true,...resultado}));
 });
 return enviados;
}
async function abrir(){const botao=await screen.findByRole("button",{name:"Conferir com extrato"});botao.focus();fireEvent.click(botao);return screen.getByRole("dialog",{name:"Conferir com extrato"});}

it("oferece só o resumo antes de abrir e devolve foco ao cancelar",async()=>{
 preparar();render(<ConferenciaDaCaixinha investimentos={[posicao()]}/>);
 expect(screen.queryByRole("dialog")).toBeNull();expect(screen.queryByRole("combobox")).toBeNull();
 await abrir();fireEvent.click(screen.getByRole("button",{name:"Cancelar"}));
 expect(screen.queryByRole("dialog")).toBeNull();expect(document.activeElement).toBe(screen.getByRole("button",{name:"Conferir com extrato"}));
});
it("filtra remuneradas e escolhe a única com posição pela FK, sem segundo seletor",async()=>{
 preparar([conta(),conta("corrente","corrente"),conta("cartao","cartao")]);render(<ConferenciaDaCaixinha investimentos={[posicao()]}/>);
 const dialogo=await abrir();const campo=within(dialogo).getByLabelText<HTMLSelectElement>("Conta investimentos");
 expect(campo.value).toBe("c1");expect(within(dialogo).getAllByRole("combobox")).toHaveLength(1);
 expect(screen.queryByRole("option",{name:"Conta corrente"})).toBeNull();expect(screen.queryByRole("option",{name:"Conta cartao"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Fechamento do mês"}));expect(screen.getByLabelText("Mês do extrato")).toBeTruthy();
});
it("exige escolha com duas remuneradas e explica o que falta",async()=>{
 preparar([conta(),conta("c2")]);render(<ConferenciaDaCaixinha investimentos={[posicao(),posicao("i2","c2")]}/>);
 await abrir();expect(screen.getByLabelText<HTMLSelectElement>("Conta investimentos").value).toBe("");
 const confirmar=screen.getByRole("button",{name:"Confirmar saldo"}) as HTMLButtonElement;
 expect(confirmar.disabled).toBe(true);expect(document.getElementById(confirmar.getAttribute("aria-describedby")!)?.textContent).toContain("escolher a conta");
});
it("usa saldo e data próprios do extrato sem copiar o saldo total",async()=>{
 const enviados=preparar();render(<ConferenciaDaCaixinha investimentos={[posicao()]}/>);await abrir();
 fireEvent.change(screen.getByLabelText("Saldo no extrato"),{target:{value:"96217"}});
 fireEvent.change(screen.getByLabelText("Data do saldo"),{target:{value:"2026-11-30"}});
 fireEvent.click(screen.getByRole("button",{name:"Confirmar saldo"}));
 await waitFor(()=>expect(enviados).toHaveLength(1));expect(enviados[0].corpo).toEqual({conta_id:"c1",saldo_remunerado:"962.17",data_do_saldo:"2026-11-30"});
});
it("salva a referência na posição da conta e distingue zero explícito de fim não preenchido",async()=>{
 const enviados=preparar();render(<ConferenciaDaCaixinha investimentos={[posicao()]}/>);await abrir();
 fireEvent.click(screen.getByRole("button",{name:"Fechamento do mês"}));
 const salvar=screen.getByRole("button",{name:"Salvar conferência"}) as HTMLButtonElement;expect(salvar.disabled).toBe(true);
 fireEvent.change(screen.getByLabelText("Mês do extrato"),{target:{value:"2026-11"}});
 fireEvent.change(screen.getByLabelText("Saldo no fim do mês"),{target:{value:"0"}});
 fireEvent.click(screen.getByLabelText("Conferi todos os lançamentos do extrato deste mês"));
 expect(salvar.disabled).toBe(false);fireEvent.click(salvar);
 await waitFor(()=>expect(enviados).toHaveLength(1));expect(enviados[0].caminho).toContain("/investimentos/i1/");expect(enviados[0].corpo).toEqual({saldo_inicial:"0.00",saldo_final:"0.00",periodo_completo:true});
});
it.each([[{conciliado:true,completo:true},"Conta investimentos conciliada no mês."],[{conciliado:false,completo:true},"Há divergência com o extrato."],[{conciliado:false,completo:false},"Conferência incompleta: confira o período e as transações pendentes."]])("mantém o resultado da consulta: %s",async(resultado,texto)=>{
 preparar([conta()],resultado);render(<ConferenciaDaCaixinha investimentos={[posicao()]}/>);await abrir();fireEvent.click(screen.getByRole("button",{name:"Fechamento do mês"}));expect(await screen.findByText(texto)).toBeTruthy();
});
it("sem posição explica a indisponibilidade do fechamento",async()=>{
 preparar();render(<ConferenciaDaCaixinha investimentos={[]}/>);await abrir();expect((screen.getByRole("button",{name:"Fechamento do mês"}) as HTMLButtonElement).disabled).toBe(true);expect(screen.getByText(/Confirme o saldo de hoje para criar a posição/)).toBeTruthy();
});
it("sem conta remunerada não oferece conta corrente como substituta",async()=>{
 preparar([conta("corrente","corrente")]);const {container}=render(<ConferenciaDaCaixinha investimentos={[]}/>);
 await waitFor(()=>expect(container.textContent).toBe(""));expect(screen.queryByRole("button",{name:"Conferir com extrato"})).toBeNull();
});
it("mostra erro da API dentro do diálogo",async()=>{
 preparar([conta()],{},true);render(<ConferenciaDaCaixinha investimentos={[posicao()]}/>);await abrir();fireEvent.click(screen.getByRole("button",{name:"Confirmar saldo"}));expect(await screen.findByRole("alert")).toBeTruthy();expect(screen.getByRole("alert").textContent).toContain("Confira a data do extrato.");
});

it("não inicia consultas mensais canceladas pela remontagem do React",async()=>{preparar();const original=fetch;const ler=vi.fn(original);vi.stubGlobal("fetch",ler);const primeira=render(<ConferenciaDaCaixinha investimentos={[posicao()]}/>);await screen.findAllByText(/conferido$/);primeira.unmount();invalidar("reconciliacao");ler.mockClear();render(<StrictMode><ConferenciaDaCaixinha investimentos={[posicao()]}/></StrictMode>);await screen.findAllByText(/conferido$/);expect(ler.mock.calls.filter(([url])=>String(url).includes("/reconciliacao"))).toHaveLength(2);});
