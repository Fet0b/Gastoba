import { expect, test, type Locator, type Page } from "@playwright/test";

/** Cada carregamento começa com exemplos fictícios e sem sessão. */
export async function entrar(page: Page): Promise<void> {
  const origem = new URL(test.info().project.use.baseURL ?? "http://localhost:5173").origin;
  await page.route("**/*", (rota) =>
    new URL(rota.request().url()).origin === origem
      ? rota.continue()
      : rota.abort("blockedbyclient"),
  );
  await page.clock.setFixedTime(new Date(2026, 9, 29, 12));
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill("voce@exemplo.com");
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-exemplo-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Metas do mês" })).toBeVisible();
}

export async function irPara(page: Page, nome: string): Promise<void> {
  const botao = page.getByRole("navigation", { name: "Telas" }).getByRole("button", { name: nome, exact: true });
  if (await botao.count()) await botao.click();
  else {
    await page.getByRole("button", { name: "Mais", exact: true }).click();
    await page.getByRole("dialog", { name: "Mais telas" }).getByRole("button", { name: nome, exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: nome, exact: true })).toBeVisible();
}

/** Shift+Tab e Tab chegam ao controle pelo teclado, inclusive no emulador de toque. */
export async function focarPeloTeclado(page: Page, controle: Locator): Promise<void> {
  await controle.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(controle).toBeFocused();
  await expect.poll(() => controle.evaluate((elemento) => {
    const estilo = getComputedStyle(elemento);
    return elemento.matches(":focus-visible") && estilo.outlineStyle !== "none" && parseFloat(estilo.outlineWidth) >= 2;
  })).toBe(true);
}
