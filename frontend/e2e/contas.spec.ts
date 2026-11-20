import { expect, test } from "@playwright/test";
import { entrar, irPara } from "./apoio";

test("Contas: painel de topo com três números sem soma e cartões irmãos de mesma altura", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Contas");

  const destaque = page.getByRole("group", { name: /^Dinheiro nas contas correntes/ });
  await expect(destaque).toBeVisible();
  await expect(page.getByText("Patrimônio")).toHaveCount(0);

  // Dois cartões da mesma linha da grade têm a mesma altura e o saldo (na base) na mesma linha.
  const cartoes = page.locator("main ul li").filter({ has: page.locator("[data-tom]") });
  expect(await cartoes.count()).toBeGreaterThan(1);
  const medidas = await cartoes.evaluateAll((itens) =>
    itens.map((item) => {
      const caixa = item.getBoundingClientRect();
      const saldo = item.querySelector("[data-tom] > span:last-child")?.getBoundingClientRect();
      return { topo: Math.round(caixa.top), altura: Math.round(caixa.height), base: Math.round(caixa.bottom - (saldo?.bottom ?? 0)) };
    }),
  );
  for (const m of medidas.filter((m) => m.topo === medidas[0].topo)) {
    expect(m.altura).toBe(medidas[0].altura);
    expect(Math.abs(m.base - medidas[0].base)).toBeLessThanOrEqual(2);
  }
});

test("Contas: Nova conta fica no cabeçalho da seção e abre um diálogo", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Contas");

  await page.getByRole("button", { name: "Nova conta", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Nova conta" });
  await expect(dialogo).toBeVisible();
  await dialogo.getByLabel("Nome", { exact: true }).fill("Reserva do teste");
  await dialogo.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(dialogo).toBeHidden();
  await expect(page.getByText("Conta criada.")).toBeVisible();
});
