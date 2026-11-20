import { expect, test } from "@playwright/test";
import { entrar, irPara } from "./apoio";

test("auditoria: caixinha, vencimento, composição e consultas sob demanda", async ({page}) => {
 test.setTimeout(60000);
 await entrar(page);
 await page.clock.setFixedTime(new Date(2026,10,10,12));
 await page.evaluate(async()=>{
  const caminho="/src/simulacao/manipuladores.ts";
  const sim=await import(/* @vite-ignore */caminho) as typeof import("../src/simulacao/manipuladores");
  const {contaId}=sim.prepararCenarioDeReaplicacao();
  const api="/src/api/cliente.ts";
  const {chamar}=await import(/* @vite-ignore */api) as {chamar:<T=unknown>(caminho:string,opcoes?:{metodo?:string;corpo?:unknown})=>Promise<T>};
  await chamar("/ganhos",{metodo:"POST",corpo:{conta_id:contaId,descricao:"Renda fictícia",valor:"1000.00",data:"2026-11-10",tags:[]}});
  await chamar("/sincronizacoes",{metodo:"POST"});
  const contas=await chamar<import("../src/api/tipos").Conta[]>("/contas");
  const contaBanco=contas.find(c=>c.origem==="open_finance"&&c.tipo!=="cartao")!;
  await chamar("/caixinhas",{metodo:"POST",corpo:{conta_id:contaBanco.id,saldo_remunerado:"962.17",data_do_saldo:"2026-11-08"}});
  for(let i=0;i<76;i++) sim.adicionarInvestimentoSimulado({nome:`CDB - BANCO INTER S.A ${i}`,tipo:"FIXED_INCOME",subtipo:"CDB",saldo:"405.91"});
  const u="/src/api/useConsulta.ts";
  (await import(/* @vite-ignore */u) as typeof import("../src/api/useConsulta")).invalidar("");
 });
 await irPara(page,"Transações");
 await page.getByRole("button",{name:"Aportes e resgates",exact:true}).click();
 // O resgate do cenário é de outubro; o sino abre a competência histórica.
 await page.getByRole("button",{name:/^Avisos: 1 resgate sem caixinha/}).click();
 // Sem caixinhas nesta posição, o fluxo atual confirma a natureza da entrada.
 await page.getByRole("button",{name:/Confirmar natureza/}).click();
 await page.getByLabel("Natureza da entrada").selectOption("vencimento");
 await page.getByRole("button",{name:"Confirmar natureza da entrada"}).click();
 // Posição sem caixinhas: o vencimento confirmado sai do sino (069, D2).
 await expect(page.getByRole("button",{name:"Avisos: nenhum"})).toBeVisible();
 await page.evaluate(()=>{
  const w=window as typeof window & {pedidosAuditoria:string[]};w.pedidosAuditoria=[];
  const original=window.fetch;
  window.fetch=(entrada,opcoes)=>{const url=String(entrada);if(url.includes(":8000")||url.includes("/api/"))w.pedidosAuditoria.push(new URL(url).pathname);return original(entrada,opcoes);};
 });
 await irPara(page,"Investimentos");
 // 071: a conta investimentos mostra só o saldo do banco; a conferência mensal saiu da tela.
 await expect(page.getByRole("region",{name:"Conferência com extrato"})).toHaveCount(0);
 await expect(page.getByRole("heading",{name:"Posições",exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as typeof window & {pedidosAuditoria:string[]}).pedidosAuditoria.filter(p=>p.endsWith("/realocacoes")).length)).toBe(0);
 const pedidos=await page.evaluate(()=>(window as typeof window & {pedidosAuditoria:string[]}).pedidosAuditoria);
 expect(pedidos.length,pedidos.join(", ")).toBeLessThanOrEqual(10);
 await page.getByRole("button",{name:/^Mais ações de /}).first().click();
 await page.getByRole("menuitem",{name:"Ver realocações",exact:true}).click();
 await expect(page.getByText("Nenhuma realocação ainda",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Concluir",exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/auditoria-investimentos-${test.info().project.name}.png`,fullPage:false});
});
