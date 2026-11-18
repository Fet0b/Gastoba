import { test, expect, type Locator } from "@playwright/test";
import { entrar, irPara } from "./apoio";

test("mantém as telas e os controles dentro da largura disponível", async ({ page }, testInfo) => {
  await entrar(page);
  async function conferir(nome: string, botao: Locator): Promise<void> {
    await expect(botao).toBeVisible();
    await botao.scrollIntoViewIfNeeded();
    await expect(botao).toBeInViewport();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), nome).toBeLessThanOrEqual(0);
    const limites = await botao.boundingBox();
    expect(limites).not.toBeNull();
    expect(limites!.x).toBeGreaterThanOrEqual(0);
    expect(limites!.x + limites!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    const caminho = testInfo.outputPath(`${nome}.png`);
    await page.screenshot({ path: caminho, fullPage: true, animations: "disabled" });
    await testInfo.attach(nome, { path: caminho, contentType: "image/png" });
  }
  await irPara(page, "Orçamento");
  await page.getByRole("button", { name: "Editar metas", exact: true }).first().click();
  await conferir("orcamento", page.getByRole("button", { name: "Definir renda-base", exact: true }));
  await irPara(page, "Transações");
  await conferir("gastos", page.getByRole("button", { name: "Novo gasto", exact: true }));
  await page.getByRole("button", { name: "Caixa de entrada", exact: true }).click();
  await page.getByRole("button", { name: "Sincronizar agora", exact: true }).click();
  await expect(page.getByRole("listitem", { name: "Mercado Extra", exact: true })).toBeVisible();
  const tituloDaTransacao = page.getByRole("listitem", { name: "Mercado Extra", exact: true }).getByRole("heading", { name: "Mercado Extra", exact: true });
  await expect.poll(() => tituloDaTransacao.evaluate((el) =>
    Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)),
  ), "O título curto deve continuar legível, em até duas linhas").toBeLessThanOrEqual(2);
  await conferir("caixa", page.getByRole("button", { name: "Sincronizar agora", exact: true }));
  await page.getByRole("button", { name: "Aportes e resgates", exact: true }).click();
  await conferir("aportes", page.getByRole("button", { name: "Mais ações de classificação de Aplicação na LCI", exact: true }));
  await irPara(page, "Investimentos");
  await conferir("investimentos", page.getByRole("button", { name: "Ver aportes e resgates em Transações", exact: true }));
  await irPara(page, "Faturas");
  await conferir("faturas", page.getByRole("button", { name: "Faturas anteriores", exact: true }).first());
});
