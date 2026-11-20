import { expect, test } from "@playwright/test";
import { entrar, irPara } from "./apoio";

test("Transações: a tecla / foca a busca e os filtros ativos podem ser limpos", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Transações");

  const busca = page.getByLabel("Buscar transações");
  await expect(busca).toBeVisible();
  await page.keyboard.press("/");
  await expect(busca).toBeFocused();

  // No celular os filtros ficam numa folha; no computador, em seletores de várias escolhas.
  const folha = page.getByRole("button", { name: /^Filtros/ });
  if (await folha.count()) {
    await folha.click();
    await page.getByRole("dialog", { name: "Filtros" }).getByRole("group", { name: "Filtrar por categoria" }).getByRole("button").first().click();
    await page.getByRole("dialog", { name: "Filtros" }).getByRole("button", { name: "Concluir" }).click();
  } else {
    await page.getByRole("button", { name: /^Categorias:/ }).click();
    await page.getByRole("group", { name: "Categorias" }).getByRole("checkbox").first().check();
  }
  await expect(page.getByRole("list", { name: "Filtros ativos" })).toBeVisible();
  if (await folha.count()) await page.getByRole("list", { name: "Filtros ativos" }).getByRole("button").first().click();
  else await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await expect(page.getByRole("list", { name: "Filtros ativos" })).toHaveCount(0);
});
