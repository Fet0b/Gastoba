import { expect, test } from "@playwright/test";
import { entrar, irPara } from "./apoio";

// Frente 071: a aplicação e o resgate automáticos da conta investimentos (os "espelhos") nunca
// chegam à caixa, e o resto do caminho (depósito, compra do CDB, IOF, aporte tratado) continua.

test.beforeEach(async ({ page }) => {
  await entrar(page);
  await irPara(page, "Transações");
  await page.getByRole("button", { name: /^Caixa de entrada/ }).click();
  await page.getByRole("button", { name: "Sincronizar agora", exact: true }).click();
  await expect(page.getByRole("listitem", { name: "Mercado Extra", exact: true })).toBeVisible();
});

test("o espelho não aparece na caixa e fica em Ver ignoradas como movimento interno, sem restaurar", async ({ page }) => {
  await expect(page.getByRole("listitem", { name: /CONTA REMUNERADA/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Ver ignoradas", exact: true }).click();
  const espelho = page.getByRole("listitem", { name: "Aplicação automática", exact: true });
  await expect(espelho).toBeVisible();
  await expect(espelho.getByText("Movimento interno da conta", { exact: true })).toBeVisible();
  await expect(espelho.getByText(/Não precisa de ação/)).toBeVisible();
  await expect(espelho.getByRole("button", { name: /Desfazer classificação/ })).toHaveCount(0);
});

test("o IOF de compra no exterior é aceito como gasto numa conta corrente", async ({ page }) => {
  const iof = page.getByRole("listitem", { name: "IOF DESPESA NO EXTERIOR", exact: true });
  await expect(iof).toBeVisible();
  await iof.getByRole("radio", { name: "Lazer", exact: true }).check();
  await iof.getByRole("button", { name: /Aceitar como gasto/ }).click();
  await expect(iof).toHaveCount(0);

  await page.getByRole("button", { name: "Gastos e ganhos", exact: true }).click();
  await expect(page.getByText(/IOF DESPESA NO EXTERIOR/i).first()).toBeVisible();
});

test("confirma o tratamento de um aporte sem investimento na própria tela", async ({ page }) => {
  const mercado = page.getByRole("listitem", { name: "Mercado Extra", exact: true });
  await mercado.getByRole("radio", { name: "Aporte", exact: true }).check();
  await mercado.getByRole("button", { name: "Aceitar como aporte: Mercado Extra", exact: true }).click();
  await expect(mercado).toHaveCount(0);

  await irPara(page, "Investimentos");
  await page.getByRole("button", { name: "Revisar aportes" }).click();
  const aportes = page.getByRole("dialog", { name: "Revisar aportes sem investimento", exact: true });
  await aportes.getByRole("button", { name: /Mais ações do aporte/ }).click();
  await page.getByRole("menuitem", { name: "Excluir", exact: true }).click();
  await page.getByRole("dialog", { name: "Excluir este aporte?" }).getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(aportes.getByText(/aguarda a sua confirmação/)).toBeVisible();

  await aportes.getByRole("button", { name: "Confirmar tratamento", exact: true }).click();
  const confirmacao = page.getByRole("dialog", { name: "Confirmar o tratamento?" });
  await expect(confirmacao.getByRole("button", { name: "Cancelar", exact: true })).toBeFocused();
  await confirmacao.getByRole("button", { name: "Confirmar exclusão", exact: true }).click();
  await expect(aportes.getByText(/aguarda a sua confirmação/)).toHaveCount(0);
  await expect(aportes.getByText("Nenhum aporte sem investimento")).toBeVisible();
});
