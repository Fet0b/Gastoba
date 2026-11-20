import { test, expect } from "@playwright/test";
import { entrar, irPara } from "./apoio";

test("ignora transferência com motivo, filtra e restaura sem aceitar", async ({ page }) => {
  test.setTimeout(60_000);
  await entrar(page);
  await irPara(page, "Transações");
  await page.getByRole("button", { name: /^Caixa de entrada/ }).click();
  await page.getByRole("button", { name: "Sincronizar agora", exact: true }).click();
  const cartao = page.getByRole("listitem", { name: "Mercado Extra", exact: true });
  await cartao.getByRole("radio", { name: "Transferência", exact: true }).check();
  await cartao.getByRole("button", { name: "Ignorar: Mercado Extra", exact: true }).click();
  await expect(cartao).toHaveCount(0);
  await page.getByRole("button", { name: "Ver ignoradas", exact: true }).click();
  await page.getByRole("checkbox", { name: "Ignoradas: transferência entre contas", exact: true }).check();
  await expect(cartao).toBeVisible();
  await expect(cartao.getByText("Transferência entre contas", { exact: true })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "Pagamento recebido", exact: true })).toHaveCount(0);
  await cartao.getByRole("button", { name: "Desfazer classificação: Mercado Extra", exact: true }).click();
  await page.getByRole("button", { name: "Sim, desfazer", exact: true }).click();
  await expect(cartao).toHaveCount(0);
  await page.getByRole("button", { name: "Ver pendentes", exact: true }).click();
  await expect(cartao).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
