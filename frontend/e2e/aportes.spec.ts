import { test, expect, type Locator, type Page } from "@playwright/test";
import { entrar, irPara } from "./apoio";

test.beforeEach(async ({ page }) => {
  await entrar(page);
  await irPara(page, "Transações");
  await page.getByRole("button", { name: /^Caixa de entrada/ }).click();
  await page.getByRole("button", { name: "Sincronizar agora", exact: true }).click();
  await expect(page.getByRole("listitem", { name: "Mercado Extra", exact: true })).toBeVisible();
});


/** Abre o menu "Mais ações" do item e escolhe "Desfazer ..."; o diálogo de confirmação abre. */
async function pedirDesfazer(page: Page, item: Locator, descricao: string): Promise<void> {
  await item.getByRole("button", { name: `Mais ações de ${descricao}`, exact: true }).click();
  await page.getByRole("menuitem", { name: /Desfazer classificação/ }).click();
}

test("aceita um aporte e um resgate e devolve cada transação à caixa", async ({ page }) => {
  for (const [descricao, atalho, tipo] of [
    ["Mercado Extra", "Aporte", "aporte"],
    ["Salário", "Resgate", "resgate"],
  ]) {
    const cartao = page.getByRole("listitem", { name: descricao, exact: true });
    const dadosOriginais = await cartao.locator("h3 + p").textContent();
    await cartao.getByRole("radio", { name: atalho, exact: true }).check();
    await cartao.getByRole("button", { name: `Aceitar como ${tipo}: ${descricao}`, exact: true }).click();
    await expect(cartao).toHaveCount(0);
    await page.getByRole("button", { name: "Aportes e resgates", exact: true }).click();
    const movimento = page.getByRole("listitem", { name: descricao, exact: true });
    await expect(movimento).toBeVisible();
    await pedirDesfazer(page, movimento, `classificação de ${descricao}`);
    await expect(movimento.getByRole("button", { name: "Cancelar", exact: true })).toBeFocused();
    await expect(movimento).toBeVisible();
    await movimento.getByRole("button", { name: "Sim, desfazer", exact: true }).click();
    await expect(movimento).toHaveCount(0);
    await expect(page.getByText("A transação voltou para a caixa de entrada.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^Caixa de entrada/ }).click();
    await expect(cartao).toBeVisible();
    await expect(cartao.locator("h3 + p")).toHaveText(dadosOriginais ?? "");
  }
});

test("desfaz uma divisão inteira só depois da confirmação adicional", async ({ page }) => {
  const cartao = page.getByRole("listitem", { name: "Mercado Extra", exact: true });
  await cartao.getByRole("button", { name: "Dividir em partes", exact: true }).click();
  await cartao.getByRole("radiogroup", { name: "Tipo da parte 1", exact: true }).getByRole("radio", { name: "Aporte" }).check();
  await cartao.getByLabel("Categoria da parte 2", { exact: true }).selectOption("lazer");
  await cartao.getByRole("button", { name: "Salvar divisão: Mercado Extra", exact: true }).click();
  await expect(cartao).toHaveCount(0);
  await page.getByRole("button", { name: "Gastos e ganhos", exact: true }).click();
  await expect(page.getByText("Mercado Extra (2/2)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Aportes e resgates", exact: true }).click();
  const aporte = page.getByRole("listitem", { name: "Mercado Extra (1/2)", exact: true });
  await pedirDesfazer(page, aporte, "classificação de Mercado Extra (1/2)");
  await expect(aporte.getByRole("dialog")).toContainText("A divisão inteira será desfeita: 2 lançamentos");
  await expect(aporte.getByRole("button", { name: "Cancelar", exact: true })).toBeFocused();
  await aporte.getByRole("button", { name: "Cancelar", exact: true }).press("Enter");
  await expect(aporte.getByRole("button", { name: "Mais ações de classificação de Mercado Extra (1/2)", exact: true })).toBeFocused();
  await pedirDesfazer(page, aporte, "classificação de Mercado Extra (1/2)");
  await aporte.getByRole("button", { name: "Desfazer a divisão inteira", exact: true }).click();
  await expect(aporte).toHaveCount(0);
  await page.getByRole("button", { name: "Gastos e ganhos", exact: true }).click();
  await expect(page.getByText("Mercado Extra (2/2)", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^Caixa de entrada/ }).click();
  await expect(cartao).toBeVisible();
});

test("mantém o aporte antigo quando a origem não é identificável com segurança", async ({ page }) => {
  await page.getByRole("button", { name: "Aportes e resgates", exact: true }).click();
  const legado = page.getByRole("listitem", { name: "Aplicação na LCI", exact: true });
  await pedirDesfazer(page, legado, "classificação de Aplicação na LCI");
  await legado.getByRole("button", { name: "Sim, desfazer", exact: true }).click();
  await expect(legado.getByRole("alert")).toHaveText("Não dá para identificar com segurança a transação de origem deste aporte; nada foi alterado.");
  await expect(legado).toBeVisible();
  await expect(legado.getByRole("button", { name: "Mais ações de classificação de Aplicação na LCI", exact: true })).toBeFocused();
});
