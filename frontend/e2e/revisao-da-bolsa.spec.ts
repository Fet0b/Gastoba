import { expect, test, type Page } from "@playwright/test";
import { entrar, irPara } from "./apoio";

async function abrirRevisao(page: Page) {
  await entrar(page);
  await irPara(page, "Transações");
  await page.getByRole("button", { name: "Aportes e resgates", exact: true }).click();
  await page.getByRole("button", { name: "Revisar", exact: true }).click();
  return page.getByRole("dialog", { name: "Revisão da bolsa" });
}

test("abre pela aba Aportes e resgates, confere a evidência, liga em lote e desfaz", async ({ page }) => {
  const dialogo = await abrirRevisao(page);
  await expect(dialogo.getByRole("heading", { name: "Pregão de 03/11/2026" })).toBeVisible();

  const linha = dialogo.getByRole("listitem", { name: /Compra de AUPO11/ });
  await linha.getByText("Ver evidência").click();
  await expect(linha.getByRole("table")).toBeVisible();
  await expect(linha.getByText("Saldo, custo da posição e caixinhas não mudam.")).toBeVisible();

  await expect(dialogo.getByRole("button", { name: "Ligar 0 selecionadas" })).toBeDisabled();
  await dialogo.getByRole("checkbox", { name: "Selecionar as 2 com valores iguais" }).check();
  await dialogo.getByRole("button", { name: "Ligar 2 selecionadas" }).click();
  await expect(page.getByText("2 ligações feitas com as operações da corretora.")).toBeVisible();
  await expect(dialogo.getByRole("listitem", { name: /Compra de AUPO11/ })).toHaveCount(0);

  await dialogo.getByText(/Já ligados \(3\)/).click();
  await dialogo.getByRole("button", { name: /Mais ações da ligação/ }).first().click();
  await page.getByRole("menuitem", { name: "Desfazer ligação" }).click();
  const confirmacao = page.getByRole("dialog", { name: "Desfazer a ligação?" });
  await expect(confirmacao.getByRole("button", { name: "Cancelar" })).toBeFocused();
  await confirmacao.getByRole("button", { name: "Desfazer ligação" }).click();
  await expect(page.getByText("Ligação desfeita: os lançamentos voltaram à caixa.")).toBeVisible();

  await dialogo.getByRole("button", { name: "Concluir" }).click();
  await expect(page.getByRole("button", { name: "Revisar", exact: true })).toBeFocused();
});

test("sem rolagem horizontal em 320px com o diálogo aberto", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const dialogo = await abrirRevisao(page);
  await expect(dialogo).toBeVisible();
  const medidas = await page.evaluate(() => ({ pagina: document.documentElement.scrollWidth, janela: innerWidth }));
  expect(medidas.pagina).toBeLessThanOrEqual(medidas.janela);
  const interno = await dialogo.evaluate(e => e.scrollWidth <= e.clientWidth + 1);
  expect(interno).toBe(true);
});
