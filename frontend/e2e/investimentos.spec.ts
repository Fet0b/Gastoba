import { test, expect } from "@playwright/test";
import { contrasteDoTexto } from "./contraste";
import { entrar, focarPeloTeclado, irPara } from "./apoio";

test("abre Transações na seção de aportes pelo botão de Investimentos", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Investimentos");
  await expect(page.getByRole("list", { name: "Aportes e resgates", exact: true })).toHaveCount(0);
  const atalho = page.getByRole("button", { name: "Ver aportes e resgates em Transações", exact: true });
  await focarPeloTeclado(page, atalho);
  await atalho.press("Enter");
  await expect(page.getByRole("heading", { name: "Transações", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aportes e resgates", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("listitem", { name: "Aplicação na LCI", exact: true })).toBeVisible();
});

test("divide o valor entre destinações só com as barras", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Investimentos");
  await page.getByRole("button", { name: /^Mais ações de / }).first().click();
  await page.getByRole("menuitem", { name: "Definir destinações", exact: true }).click();

  await page.getByLabel("Tag da destinação 1", { exact: true }).fill("casa");
  const adicionar = page.getByRole("button", { name: "Adicionar destinação", exact: true });
  await adicionar.click();
  await page.getByLabel("Tag da destinação 2", { exact: true }).fill("viagem");
  await adicionar.click();
  await page.getByLabel("Tag da destinação 3", { exact: true }).fill("reserva");

  await page.getByLabel("Percentual da destinação 1", { exact: true }).fill("50");

  // Estado incompleto: o restante aparece e tem contraste de texto.
  const restante = page.locator("[data-restante]");
  await expect(restante).toBeVisible();
  expect(await contrasteDoTexto(restante)).toBeGreaterThanOrEqual(4.5);

  const barra2 = page.getByLabel("Ajustar o percentual da destinação 2", { exact: true });
  await focarPeloTeclado(page, barra2);
  await barra2.press("End");
  for (let i = 0; i < 3; i += 1) await barra2.press("PageDown");
  const barra3 = page.getByLabel("Ajustar o percentual da destinação 3", { exact: true });
  await focarPeloTeclado(page, barra3);
  await barra3.press("PageUp");
  await barra3.press("PageUp");

  await expect(page.getByText("Soma: 100%", { exact: true })).toBeVisible();
  await expect(page.locator("[data-restante]")).toHaveCount(0);
  const linhas = page.getByRole("group", { name: "Destinações", exact: true }).locator("> div:has(input[type=range])");
  const quantidade = await linhas.count();
  expect(quantidade).toBe(3);
  for (let i = 0; i < quantidade; i += 1) {
    await expect(linhas.nth(i)).toContainText("R$");
  }
  const semRolagem = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(semRolagem).toBe(true);
});

test("a conta investimentos mostra só o saldo do banco, sem conferência mensal (071)",async({page})=>{
  await entrar(page);
  await page.evaluate(async()=>{
    const caminho="/src/api/cliente.ts";
    const {chamar}=await import(/* @vite-ignore */caminho) as {chamar:<T=unknown>(caminho:string,opcoes?:{metodo?:string;corpo?:unknown})=>Promise<T>};
    await chamar("/sincronizacoes",{metodo:"POST"});
    const contas=await chamar<import("../src/api/tipos").Conta[]>("/contas");
    const conta=contas.find(c=>c.origem==="open_finance"&&c.tipo!=="cartao")!;
    await chamar("/caixinhas",{metodo:"POST",corpo:{conta_id:conta.id,saldo_remunerado:"962.17",data_do_saldo:"2026-10-29"}});
    const consultas="/src/api/useConsulta.ts";
    const {invalidar}=await import(/* @vite-ignore */consultas) as {invalidar:(prefixo:string)=>void};
    invalidar("");
  });
  await irPara(page,"Investimentos");
  for(const largura of [1366,390]){
    await page.setViewportSize({width:largura,height:900});
    const posicao=page.getByRole("listitem",{name:/Conta investimentos/});
    await expect(posicao).toContainText("962,17");
    await expect(posicao.getByText("Rendimento",{exact:true})).toHaveCount(0);
    await expect(posicao.getByText("Aplicado",{exact:true})).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Conferir com extrato",exact:true})).toHaveCount(0);
  }
});
