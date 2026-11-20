import { expect, test, type Page } from "@playwright/test";

import { entrar, irPara } from "./apoio";
import { contrasteDoTexto } from "./contraste";

/** A barra do espectro é um `input[type=range]`: o valor é posto pelo próprio navegador. */
async function escolherMatiz(page: Page, matiz: number): Promise<void> {
  await page.getByRole("slider", { name: "Ajuste fino da cor" }).evaluate((el, valor) => {
    const entrada = el as HTMLInputElement;
    const definir = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    definir?.call(entrada, String(valor));
    entrada.dispatchEvent(new Event("input", { bubbles: true }));
  }, matiz);
}

const formulario = (page: Page) => page.getByRole("form", { name: "Aparência do app" });
const token = (page: Page, nome: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), nome);

test("trocar a cor, salvar, sair e entrar de novo mantém a cor", async ({ page }) => {
  await entrar(page);
  const padrao = await token(page, "--cor-ametista");
  await irPara(page, "Perfil");
  await formulario(page).getByRole("radio", { name: "Verde" }).check();
  expect(await token(page, "--cor-ametista")).not.toBe(padrao);
  await formulario(page).getByRole("button", { name: "Salvar aparência" }).click();
  await expect(page.getByText("Aparência salva.")).toBeVisible();
  const escolhida = await token(page, "--cor-ametista");

  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByLabel("E-mail", { exact: true })).toBeVisible();
  expect(await token(page, "--cor-ametista")).toBe(padrao);

  await page.getByLabel("E-mail", { exact: true }).fill("voce@exemplo.com");
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-exemplo-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Metas do mês" })).toBeVisible();
  expect(await token(page, "--cor-ametista")).toBe(escolhida);
});

for (const [nome, matiz, intensidade] of [
  ["vermelho vivo", 0, "Viva"],
  ["amarelo vivo", 55, "Viva"],
  ["ciano suave", 185, "Suave"],
] as const) {
  test(`contraste do texto com ${nome}`, async ({ page }) => {
    await entrar(page);
    await irPara(page, "Perfil");
    await escolherMatiz(page, matiz);
    await formulario(page).getByRole("radio", { name: intensidade }).check();
    const rotulo = page.getByRole("main").getByText("Conectado como");
    expect(await contrasteDoTexto(rotulo)).toBeGreaterThanOrEqual(4.5);
    expect(await contrasteDoTexto(rotulo.locator("xpath=following-sibling::*[1]"))).toBeGreaterThanOrEqual(4.5);
    const botao = page.locator('[data-cabecalho-da-tela] [data-variante="primario"]:visible');
    expect(await contrasteDoTexto(botao)).toBeGreaterThanOrEqual(4.5);
  });
}

test("o nome e a logo escolhidos aparecem na barra lateral e na aba", async ({ page, isMobile }) => {
  await entrar(page);
  await irPara(page, "Perfil");
  await formulario(page).getByRole("radio", { name: "Cofre" }).check();
  await formulario(page).getByLabel("Nome do app").fill("Meu cofre");
  await formulario(page).getByRole("button", { name: "Salvar aparência" }).click();
  await expect(page.getByText("Aparência salva.")).toBeVisible();
  await expect(page).toHaveTitle("Meu cofre");
  if (!isMobile) {
    await expect(page.getByRole("heading", { level: 1, name: "Meu cofre" })).toBeVisible();
    await expect(page.locator("aside [data-marca='cofre']")).toBeVisible();
  }
});

test("restaurar a aparência padrão devolve a cor, o nome e a logo", async ({ page, isMobile }) => {
  await entrar(page);
  const padrao = await token(page, "--cor-ametista");
  await irPara(page, "Perfil");
  await formulario(page).getByRole("radio", { name: "Verde" }).check();
  await formulario(page).getByLabel("Nome do app").fill("Outro nome");
  await formulario(page).getByRole("button", { name: "Salvar aparência" }).click();
  await expect(page.getByText("Aparência salva.")).toBeVisible();
  await page.getByRole("button", { name: "Mais ações da aparência" }).click();
  await page.getByRole("menuitem", { name: "Restaurar a aparência padrão" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Restaurar", exact: true }).click();
  await expect(page.getByText("Aparência padrão restaurada.")).toBeVisible();
  expect(await token(page, "--cor-ametista")).toBe(padrao);
  await expect(page).toHaveTitle("Gastoba");
  if (!isMobile) await expect(page.getByRole("heading", { level: 1, name: "Gastoba" })).toBeVisible();
});

test("com aparência não padrão, as telas não rolam de lado e Investimentos passa na auditoria", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Perfil");
  await escolherMatiz(page, 25);
  await formulario(page).getByRole("radio", { name: "Grade" }).check();
  await formulario(page).getByLabel("Nome do app").fill("Nome comprido demais");
  await formulario(page).getByRole("button", { name: "Salvar aparência" }).click();
  await expect(page.getByText("Aparência salva.")).toBeVisible();
  for (const tela of ["Início", "Transações", "Orçamento", "Contas", "Investimentos", "Tags", "Recorrências", "Perfil"]) {
    if (tela !== "Início") await irPara(page, tela);
    else await irParaInicio(page);
    const largura = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(largura[0], tela).toBeLessThanOrEqual(largura[1]);
  }
  await irPara(page, "Investimentos");
  const achados = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main :is(select,input,textarea,button,summary,table,h1,h2,h3,h4,label)")]
      .filter((e) => e.offsetParent && !e.className?.toString().trim())
      .map((e) => e.tagName),
  );
  expect(achados).toEqual([]);
});

for (const largura of [1366, 390]) {
  test(`capturas do Perfil e do Início com três aparências em ${largura}px`, async ({ page }, info) => {
    test.skip(info.project.name === "celular", "a largura é definida pelo próprio teste");
    await page.setViewportSize({ width: largura, height: 900 });
    await entrar(page);
    for (const [nome, matiz, intensidade, textura] of [
      ["vermelho-viva-linhas", 0, "Viva", "Linhas"],
      ["amarelo-viva-pontos", 55, "Viva", "Pontos"],
      ["ciano-suave-grade", 185, "Suave", "Grade"],
    ] as const) {
      await irPara(page, "Perfil");
      await escolherMatiz(page, matiz);
      await formulario(page).getByRole("radio", { name: intensidade }).check();
      await formulario(page).getByRole("radio", { name: textura }).check();
      await page.screenshot({ path: info.outputPath(`perfil-${nome}-${largura}.png`), fullPage: true, animations: "disabled" });
      await formulario(page).getByRole("button", { name: "Salvar aparência" }).click();
      await expect(page.getByText("Aparência salva.")).toBeVisible();
      await irParaInicio(page);
      await expect(page.getByRole("heading", { name: "Metas do mês" })).toBeVisible();
      await page.screenshot({ path: info.outputPath(`inicio-${nome}-${largura}.png`), fullPage: true, animations: "disabled" });
    }
  });
}

/** O Início não tem um título com o nome da tela: vai pelo link e espera a seção das metas. */
async function irParaInicio(page: Page): Promise<void> {
  const link = page.getByRole("navigation", { name: "Telas" }).getByRole("link", { name: "Início", exact: true });
  await link.click();
  await expect(page.getByRole("heading", { name: "Metas do mês" })).toBeVisible();
}
