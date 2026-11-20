import {test,expect,type Page} from "@playwright/test";
import {entrar,irPara,focarPeloTeclado} from "./apoio";

async function preparar(page:Page,opcoes:{valorCompra?:string;tags?:string[];pendente?:boolean}={}){
 await entrar(page);
 await page.clock.setFixedTime(new Date(2026,10,10,12));
 await page.evaluate(async(opcoes)=>{
  const caminho="/src/simulacao/manipuladores.ts";
  const m=await import(/* @vite-ignore */caminho) as typeof import("../src/simulacao/manipuladores");
  m.prepararCenarioLiberdadeFinanceira({...opcoes,data:"2026-11-10"});
  const cache="/src/api/useConsulta.ts";
  (await import(/* @vite-ignore */cache) as typeof import("../src/api/useConsulta")).invalidar("");
 },opcoes);
}
async function financas(page:Page){
 return page.evaluate(async()=>{
  const caminho="/src/api/cliente.ts";const {chamar}=await import(/* @vite-ignore */caminho) as {chamar:(caminho:string,opcoes?:{parametros?:Record<string,string>})=>Promise<unknown>};
  return Promise.all([chamar("/contas"),chamar("/investimentos"),chamar("/movimentos-de-investimento",{parametros:{inicio:"2026-11-01",fim:"2026-11-30"}})]);
 });
}
async function semOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
async function cobrir(page:Page,valor:string,bruto="80,00"){
 await irPara(page,"Transações");
 const acao=page.getByRole("button",{name:"Mais ações de Compra fictícia",exact:true});await focarPeloTeclado(page,acao);await acao.click();
 await page.getByRole("menuitem",{name:"Usar reserva de uma destinação",exact:true}).click();
 const dialogo=page.getByRole("dialog",{name:"Usar reserva de uma destinação"});
 const radio=dialogo.getByRole("radio",{name:/celular/});await expect(radio).not.toBeChecked();await radio.check();
 await dialogo.getByLabel("Valor coberto",{exact:true}).fill(valor);
 await dialogo.getByRole("button",{name:"Confirmar cobertura"}).click();
 await expect(dialogo.getByRole("list",{name:"Coberturas desta compra"})).toContainText(valor);
 await dialogo.getByRole("button",{name:"Fechar cobertura"}).click();await expect(acao).toBeFocused();
 await expect(page.getByRole("listitem",{name:/Compra fictícia/})).toContainText(bruto);
 await semOverflow(page);
}
async function conferirTag(page:Page,tag:string,valor:string){
 const barra=page.getByRole("button",{name:new RegExp(`^${tag}:`)});
 await expect(barra).toContainText(valor);await barra.click();
 await expect(page.getByRole("list",{name:`Gastos de ${tag}`})).toContainText(valor);
 await page.getByText("Ver como tabela",{exact:true}).click();
 await expect(page.getByRole("row",{name:tag==="Sem tag"?/^\(sem tag\) /:new RegExp(`^${tag} `,"i")})).toContainText(valor);
 await semOverflow(page);
}
async function conferirMetas(page:Page,conforto:string,liberdade:string){
 await irPara(page,"Orçamento");
 await expect(page.getByRole("img",{name:/^Conforto: /})).toHaveAttribute("aria-label",new RegExp(conforto));
 await expect(page.getByRole("img",{name:/^Liberdade financeira: /})).toHaveAttribute("aria-label",new RegExp(liberdade));
}

test("Tags mostra líquido ao cobrir parcialmente e restaura ao desfazer",async({page})=>{
 await preparar(page);const antes=await financas(page);
 await irPara(page,"Tags");await expect(page.getByRole("group",{name:"Total do mês em gastos"})).toContainText("80,00");
 await conferirMetas(page,"80,00","0,00");
 await cobrir(page,"30,00");await conferirMetas(page,"50,00","0,00");
 await irPara(page,"Tags");await expect(page.getByRole("group",{name:"Total do mês em gastos"})).toContainText("50,00");await conferirTag(page,"loja","50,00");
 await expect(page.getByRole("button",{name:/^celular:/})).toHaveCount(0);
 await irPara(page,"Transações");await page.getByRole("button",{name:"Mais ações de Compra fictícia",exact:true}).click();
 await page.getByRole("menuitem",{name:"Desfazer cobertura de celular"}).click();
 await expect(page.getByText(/^Reserva «celular»/)).toHaveCount(0);
 await conferirMetas(page,"80,00","0,00");await irPara(page,"Tags");await conferirTag(page,"loja","80,00");
 expect(await financas(page)).toEqual(antes);await semOverflow(page);
});

for(const caso of [{valorCompra:"80.01",tags:["loja","online"],total:"50,01",partes:[["loja","25,01"],["online","25,00"]]},{valorCompra:"80.00",tags:[],total:"50,00",partes:[["Sem tag","50,00"]]}]){
 test(`Tags rateia o líquido: ${caso.tags.join("/")||"sem tag"}`,async({page})=>{
  await preparar(page,caso);const antes=await financas(page);
  await cobrir(page,"30,00",caso.valorCompra.replace(".",","));await irPara(page,"Tags");
  await expect(page.getByRole("group",{name:"Total do mês em gastos"})).toContainText(caso.total);
  for(const [tag,valor] of caso.partes){await conferirTag(page,tag,valor);await page.getByText("Ver como tabela",{exact:true}).click();}
  expect(await financas(page)).toEqual(antes);
 });
}
test("Tags rateia o líquido e omite a compra totalmente coberta",async({page})=>{
 await preparar(page);const antes=await financas(page);
 await cobrir(page,"80,00");await irPara(page,"Tags");
 await expect(page.getByRole("group",{name:"Total do mês em gastos"})).toContainText("0,00");
 await expect(page.getByText("Nenhum gasto com tag neste período",{exact:true})).toBeVisible();
 await expect(page.getByRole("list",{name:"Gastos de loja"})).toHaveCount(0);
 await irPara(page,"Transações");await expect(page.getByRole("listitem",{name:/Compra fictícia/})).toContainText("80,00");
 expect(await financas(page)).toEqual(antes);await semOverflow(page);
});

test("aceita aporte sem despesa, cobre compra, revisa pendência e escolhe cor",async({page})=>{
 await preparar(page,{pendente:true});await irPara(page,"Transações");
 await page.getByRole("button",{name:/^Caixa de entrada/}).click();await page.getByRole("button",{name:"Sincronizar agora",exact:true}).click();
 const item=page.getByRole("listitem",{name:"Farmácia",exact:true});await item.getByRole("radio",{name:"Aporte",exact:true}).check({force:true});
 await expect(item.getByLabel("Categoria de despesa (opcional)")).toHaveCount(0);
 const investimento=item.getByRole("combobox",{name:"Investimento",exact:true});
 await expect(investimento).toHaveCount(1);
 await investimento.selectOption({label:"Reserva fictícia"});
 await expect(investimento.locator("option:checked")).toHaveText("Reserva fictícia");
 await item.getByLabel("Tag da destinação 1",{exact:true}).fill("celular");
 await item.getByRole("button",{name:/Aceitar como aporte/}).click();await expect(item).toHaveCount(0);
 await conferirMetas(page,"80,00","0,00");
 await irPara(page,"Transações");await page.getByRole("button",{name:"Gastos e ganhos",exact:true}).click();
 await cobrir(page,"80,00");await conferirMetas(page,"0,00","0,00");
 await irPara(page,"Investimentos");await page.getByRole("region",{name:"Revisão de investimentos"}).locator("summary").filter({hasText:/^Aportes/}).click();await page.getByRole("button",{name:"Revisar Aporte para revisar"}).click();await expect(page.getByRole("button",{name:"Cancelar revisão"})).toBeFocused();await page.getByRole("button",{name:"Confirmar revisão"}).click();await expect(page.getByText("Aporte para revisar",{exact:true})).toHaveCount(0);
 await page.getByRole("listitem",{name:"Reserva fictícia",exact:true}).getByRole("button",{name:/^Mais ações de /}).click();
 await page.getByRole("menuitem",{name:"Ver destinações e cores",exact:true}).click();
 await page.getByRole("button",{name:"Cor de «celular»"}).click();
 const radio=page.getByRole("radio",{name:"Ametista",exact:true});
 await page.getByText("Ametista",{exact:true}).click();await expect(radio).toBeChecked();
 const amostra=page.getByRole("list",{name:"Distribuição por destinação"}).getByRole("button",{name:/celular/}).locator("span[style]");
 await expect(amostra).toHaveCSS("background-color","rgb(139, 92, 246)");
 await page.getByRole("button",{name:"Concluir",exact:true}).click();
 await irPara(page,"Orçamento");await irPara(page,"Investimentos");
 await expect(amostra).toHaveCSS("background-color","rgb(139, 92, 246)");await semOverflow(page);
});
