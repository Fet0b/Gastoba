import { test, expect, type Locator, type Page } from "@playwright/test";
import { entrar, focarPeloTeclado, irPara } from "./apoio";
import { contrasteDoTexto, contrasteWcag } from "./contraste";

test("calcula o contraste WCAG com referências conhecidas", () => {
  expect(contrasteWcag([255, 255, 255], [0, 0, 0])).toBe(21);
  expect(contrasteWcag([0, 0, 0], [255, 255, 255])).toBe(21);
  expect(contrasteWcag([80, 80, 80], [80, 80, 80])).toBe(1);
  expect(contrasteWcag([119, 119, 119], [255, 255, 255])).toBeCloseTo(4.478, 3);
});

const desktop = (page: Page): boolean => page.viewportSize()!.width >= 768;

async function conferirContraste(botao: Locator, nome: string, estados = ["repouso", "hover", "foco"]): Promise<void> {
  for (const estado of estados) {
    await botao.page().mouse.move(0, 0);
    if (estado === "hover") await botao.hover();
    if (estado === "foco") await focarPeloTeclado(botao.page(), botao);
    expect(await contrasteDoTexto(botao), `${nome} em ${estado}`).toBeGreaterThanOrEqual(4.5);
  }
}

test("distingue as ações do modo de edição das metas com contraste, foco e confirmação", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Orçamento");

  // Leitura por padrão: só "Editar metas" (secundário); nada de definir, alterar ou remover.
  const editar = page.getByRole("button", { name: "Editar metas", exact: true }).first();
  await expect(editar).toHaveAttribute("data-papel", "secundaria");
  await expect(page.getByRole("button", { name: /^(Definir meta|Alterar|Remover)/ })).toHaveCount(0);
  await conferirContraste(editar, "Editar metas");
  expect(await editar.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await editar.click();

  // Salvar meta só aparece quando o texto muda, e é o único primário.
  await expect(page.getByRole("button", { name: "Salvar meta", exact: true })).toHaveCount(0);
  await page.getByLabel("Percentual da renda para Lazer", { exact: true }).fill("20");
  const salvar = page.getByRole("button", { name: "Salvar meta", exact: true });
  await expect(salvar).toHaveAttribute("data-papel", "principal");
  await conferirContraste(salvar, "Salvar meta");
  await salvar.click();
  await expect(page.getByText("Meta salva.", { exact: true })).toBeVisible();

  // O menu "Mais ações da meta Lazer" e o item destrutivo.
  const gatilho = page.getByRole("button", { name: "Mais ações da meta Lazer", exact: true });
  expect(await gatilho.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await conferirContraste(gatilho, "gatilho do menu");
  await gatilho.click();
  const item = page.getByRole("menuitem", { name: "Remover a meta de Lazer", exact: true });
  await expect(item).toHaveAttribute("data-destrutivo", "");
  await conferirContraste(item, "item destrutivo", ["repouso", "hover"]);
  await item.hover();
  await expect.poll(() => item.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  await item.press("Enter");

  const dialogo = page.getByRole("dialog", { name: "Remover a meta de Lazer?", exact: true });
  const cancelar = dialogo.getByRole("button", { name: "Cancelar", exact: true });
  await expect(cancelar).toBeFocused();
  await cancelar.press("Enter");
  await expect(dialogo).toBeHidden();
  await expect(gatilho).toBeFocused();

  await gatilho.click();
  await item.click();
  await dialogo.getByRole("button", { name: "Confirmar remoção", exact: true }).click();
  await expect(page.getByText("Meta removida.", { exact: true })).toBeVisible();
  await expect(gatilho).toHaveCount(0);
  await expect(page.getByLabel("Percentual da renda para Lazer", { exact: true })).toBeFocused();
});

test("a linha da meta é compacta e o painel dos lançamentos abre e fecha só pelo teclado", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Orçamento");
  await page.getByRole("button", { name: "Editar metas", exact: true }).first().click();
  await page.getByLabel("Percentual da renda para Lazer", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Salvar meta", exact: true }).click();
  await expect(page.getByText("Meta salva.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Concluir", exact: true }).click();

  const linha = page.getByRole("listitem", { name: "Lazer", exact: true });
  await expect(linha).toContainText(/R\$\s*[\d.]+,\d{2} de R\$\s*0,00/);
  if (desktop(page)) {
    expect(await linha.evaluate((el) => el.getBoundingClientRect().height), "SC-003").toBeLessThanOrEqual(72);
  }

  const abrir = page.getByRole("button", { name: "Ver lançamentos de Lazer", exact: true });
  await focarPeloTeclado(page, abrir);
  await page.keyboard.press("Enter");
  const painel = page.getByRole("dialog", { name: /^Lazer em / });
  await expect(painel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(painel).toBeHidden();
  await expect(abrir).toBeFocused();
});

test("define, altera e remove a renda-base sem mudar a projeção real", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Orçamento");
  await page.getByRole("button", { name: "Editar metas", exact: true }).first().click();
  await page.getByLabel("Percentual da renda para Lazer", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Salvar meta", exact: true }).click();
  await expect(page.getByText("Meta salva.", { exact: true })).toBeVisible();
  const concluir = page.getByRole("button", { name: "Concluir", exact: true });
  const meta = page.getByRole("listitem", { name: "Lazer", exact: true });
  const projecao = page.locator("[data-situacao]").filter({ hasText: "Projeção do mês" });
  await expect(projecao).toContainText("Sem renda registrada neste mês");
  const antes = await projecao.textContent();

  async function conferirLimite(limite: RegExp): Promise<void> {
    await concluir.click();
    await expect(meta).toContainText(limite);
    await page.getByRole("button", { name: "Editar metas", exact: true }).click();
  }

  for (const [acao, valor, limite] of [
    ["Definir renda-base", "500000", /R\$\s*[\d.]+,\d{2} de R\$\s*1\.000,00/],
    ["Alterar renda-base", "600000", /R\$\s*[\d.]+,\d{2} de R\$\s*1\.200,00/],
  ] as const) {
    await page.getByRole("button", { name: "Mais ações da renda-base", exact: true }).click();
    await page.getByRole("menuitem", { name: acao, exact: true }).click();
    await expect(page.getByLabel("Valor da renda-base mensal", { exact: true })).toBeFocused();
    await page.getByLabel("Valor da renda-base mensal", { exact: true }).fill(valor);
    await page.getByRole("button", { name: "Salvar renda-base", exact: true }).click();
    await expect(page.getByText("Renda-base salva.", { exact: true })).toBeVisible();
    await expect(page.getByText(/Renda real: .* abaixo/)).toBeVisible();
    await expect(projecao).toHaveText(antes ?? "");
    await conferirLimite(limite);
  }

  await page.getByRole("button", { name: "Mais ações da renda-base", exact: true }).click();
  await page.getByRole("menuitem", { name: "Remover renda-base", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Remover a renda-base?", exact: true });
  const cancelar = dialogo.getByRole("button", { name: "Cancelar", exact: true });
  await expect(cancelar).toBeFocused();
  await cancelar.press("Enter");
  await expect(page.getByRole("button", { name: "Mais ações da renda-base", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Mais ações da renda-base", exact: true }).click();
  await page.getByRole("menuitem", { name: "Remover renda-base", exact: true }).click();
  await dialogo.getByRole("button", { name: "Confirmar remoção da renda-base", exact: true }).click();
  await expect(page.getByText("Renda-base removida.", { exact: true })).toBeVisible();
  await expect(page.getByText("Metas calculadas sobre a renda registrada no mês", { exact: true })).toBeVisible();
  await expect(projecao).toHaveText(antes ?? "");
  await conferirLimite(/R\$\s*[\d.]+,\d{2} de R\$\s*0,00/);
});

test("compõe texto e fundos com alfa sobre o primeiro ancestral opaco", async ({ page }) => {
  await page.setContent('<div style="background: rgb(0, 0, 0)"><div style="background: rgba(255, 255, 255, 0.5)"><button style="background: transparent; color: rgba(255, 255, 255, 0.5)">Referência</button></div></div>');
  expect(await contrasteDoTexto(page.getByRole("button", { name: "Referência" }))).toBeCloseTo(
    contrasteWcag([191.25, 191.25, 191.25], [127.5, 127.5, 127.5]), 5,
  );
});
