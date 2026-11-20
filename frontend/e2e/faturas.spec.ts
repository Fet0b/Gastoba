import { test, expect, type Page } from "@playwright/test";
import { contrasteDoTexto } from "./contraste";
import { entrar, focarPeloTeclado, irPara } from "./apoio";

async function semRolagemHorizontal(page: Page, nome: string): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), nome)
    .toBeLessThanOrEqual(0);
}

test("Faturas mostra a aberta, as anteriores e o aviso de estimativa", async ({ page }, testInfo) => {
  await entrar(page);
  await irPara(page, "Faturas");

  const visa = page.getByRole("region", { name: "Faturas do cartão FREE VISA" });
  await expect(visa.getByRole("heading", { name: "FREE VISA", exact: true })).toBeVisible();
  await expect(visa.getByRole("article").first().locator("[data-badge]").first()).toHaveText("Aberta");
  await visa.getByRole("button", { name: "Ver lançamentos", exact: true }).click();
  await expect(visa.getByText("Anthropic Claude", { exact: true })).toBeVisible();
  // A primeira palavra deve caber inteira, inclusive no cartão de 320 px.
  expect(await visa.getByText("Anthropic Claude", { exact: true }).evaluate((elemento) => {
    const palavra = document.createRange();
    palavra.setStart(elemento.firstChild!, 0);
    palavra.setEnd(elemento.firstChild!, "Anthropic".length);
    return palavra.getClientRects().length;
  })).toBe(1);
  const aviso = visa.locator('[data-aviso="estimativa"]');
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText("Fatura estimada");
  expect(await contrasteDoTexto(aviso)).toBeGreaterThanOrEqual(4.5);
  expect(await contrasteDoTexto(visa.getByRole("heading", { name: "FREE VISA", exact: true }))).toBeGreaterThanOrEqual(4.5);

  // Só pelo teclado: o botão recebe foco visível e abre as anteriores.
  const anteriores = visa.getByRole("button", { name: "Faturas anteriores", exact: true });
  await expect(anteriores).toHaveAttribute("aria-expanded", "false");
  await focarPeloTeclado(page, anteriores);
  await page.keyboard.press("Enter");
  await expect(anteriores).toHaveAttribute("aria-expanded", "true");
  const paga = visa.getByRole("article").nth(1);
  await expect(paga.locator("[data-badge]").first()).toHaveText("Paga");
  const verCompras = paga.getByRole("button", { name: /^Ver compras/ });
  await focarPeloTeclado(page, verCompras);
  await page.keyboard.press("Enter");
  await expect(paga.getByText("Curso online", { exact: true })).toBeVisible();
  await expect(paga.getByText("Parcela 2/10")).toBeVisible();

  const roxo = page.getByRole("region", { name: "Faturas do cartão Cartão Roxo" });
  await roxo.getByRole("button", { name: "Faturas anteriores", exact: true }).click();
  await expect(roxo.getByRole("article").nth(1).locator("[data-badge]").first()).toHaveText("Vencida");

  await semRolagemHorizontal(page, "faturas");
  const caminho = testInfo.outputPath("faturas.png");
  await page.screenshot({ path: caminho, fullPage: true, animations: "disabled" });
  await testInfo.attach("faturas", { path: caminho, contentType: "image/png" });
});

test("Contas diz 'Fatura aberta' em tom neutro e destaca só a 'Vencida'", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Contas");

  const visa = page.locator("li").filter({ hasText: "FREE VISA" }).first();
  await expect(visa).toContainText("Fatura aberta");
  await expect(visa.locator('[data-selo="vencida"]')).toHaveCount(0);

  const roxo = page.locator("li").filter({ hasText: "Cartão Roxo" }).first();
  const selo = roxo.locator('[data-selo="vencida"] [data-badge]');
  await expect(selo).toHaveText("Vencida");
  expect(await contrasteDoTexto(selo)).toBeGreaterThanOrEqual(4.5);
  await expect(page.getByText("Saldo negativo")).toHaveCount(0);
  await semRolagemHorizontal(page, "contas");
});
