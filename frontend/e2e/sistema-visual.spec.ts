import { test, expect, type Page } from "@playwright/test";
import { entrar, focarPeloTeclado, irPara } from "./apoio";
import { contrasteDoTexto } from "./contraste";

async function registrarGanho(page: Page, descricao: string): Promise<void> {
  await page.getByRole("button", { name: "Novo gasto", exact: true }).click();
  await page.getByRole("dialog", { name: "Novo gasto" }).getByRole("button", { name: "Ganho", exact: true }).click();
  // Ao trocar para Ganho, o título do diálogo vira "Novo ganho".
  const dialogo = page.getByRole("dialog", { name: "Novo ganho" });
  await dialogo.getByLabel("Valor", { exact: true }).fill("12345");
  await dialogo.getByLabel("Descrição", { exact: true }).fill(descricao);
  await dialogo.getByRole("button", { name: "Registrar ganho", exact: true }).click();
  await expect(page.getByText("Ganho registrado.", { exact: true })).toBeVisible();
}

test("exclui um ganho só pelo teclado: menu da linha, diálogo com foco em Cancelar e foco final no título", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Transações");
  await registrarGanho(page, "Bônus de teste");

  const gatilho = page.getByRole("button", { name: "Mais ações de Bônus de teste", exact: true });
  await expect(gatilho).toBeVisible();
  await focarPeloTeclado(page, gatilho);

  // Abre o menu com Enter; o primeiro item (Excluir) recebe o foco.
  await page.keyboard.press("Enter");
  const item = page.getByRole("menuitem", { name: "Excluir o ganho Bônus de teste", exact: true });
  await expect(item).toBeFocused();

  // Escolher abre o diálogo com o foco em Cancelar; Esc cancela e o foco volta ao gatilho.
  await page.keyboard.press("Enter");
  const dialogo = page.getByRole("dialog", { name: "Excluir Bônus de teste?" });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Cancelar", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialogo).toBeHidden();
  await expect(gatilho).toBeFocused();

  // De novo, agora confirmando: Tab leva a "Confirmar exclusão" e Enter exclui.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(dialogo.getByRole("button", { name: "Cancelar", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialogo.getByRole("button", { name: "Confirmar exclusão", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByText("Ganho excluído.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mais ações de Bônus de teste", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Transações", exact: true })).toBeFocused();
});

const TELAS = ["Início", "Transações", "Orçamento", "Contas", "Investimentos", "Caixinhas", "Faturas", "Tags", "Recorrências", "Perfil"];

async function abrirTela(page: Page, nome: string): Promise<void> {
  if (nome === "Início") {
    // O Início é a tela de abertura; nas outras o botão leva a ela.
    const botao = page.getByRole("navigation", { name: "Telas" }).getByRole("link", { name: nome, exact: true });
    if (await botao.count()) await botao.click();
    await expect(page.getByRole("heading", { name: "Metas do mês" })).toBeVisible();
    return;
  }
  await irPara(page, nome);
}

test("nenhum botão destrutivo aparece à vista: só dentro de diálogos e menus (SC-002)", async ({ page }) => {
  await entrar(page);
  for (const nome of TELAS) {
    await abrirTela(page, nome);
    const soltos = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-papel="destrutiva"], [data-destrutivo]'))
        .filter((elemento) => elemento.getClientRects().length > 0)
        .filter((elemento) => elemento.closest('dialog[open], [role="menu"]') === null)
        .map((elemento) => elemento.textContent),
    );
    expect(soltos, `destrutivos soltos em ${nome}`).toEqual([]);
  }
});

test("todo botão visível tem alvo de toque adequado (FR-006)", async ({ page }) => {
  await entrar(page);
  const minimo = (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) ? 44 : 40;
  for (const nome of TELAS) {
    await abrirTela(page, nome);
    const pequenos = await page.evaluate((limite) =>
      Array.from(document.querySelectorAll<HTMLElement>("button"))
        .filter((botao) => botao.getClientRects().length > 0 && !botao.closest("[inert]"))
        // Chips pequenos e a seta do mês ampliam a área de toque por ::after; ficam de fora da medida do elemento.
        .filter((botao) => botao.getAttribute("data-tamanho") !== "pequeno")
        .map((botao) => ({ nome: botao.getAttribute("aria-label") ?? botao.textContent?.trim() ?? "", altura: botao.getBoundingClientRect().height }))
        .filter((botao) => botao.altura < limite - 0.5),
    minimo);
    expect(pequenos, `botões baixos em ${nome}`).toEqual([]);
  }
});

for (const largura of [320, 375]) {
  test(`as dez telas cabem em ${largura}px sem rolagem horizontal (SC-007)`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 812 });
    await entrar(page);
    for (const nome of TELAS) {
      await abrirTela(page, nome);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${nome} em ${largura}px`)
        .toBeLessThanOrEqual(0);
    }
  });
}

test("a entrada é verde e cada tela tem no máximo um número em tamanho herói (FR-002, FR-004)", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Transações");
  await registrarGanho(page, "Prêmio de teste");
  const valor = page.getByRole("listitem", { name: "Prêmio de teste" }).locator("[data-valor]").first();
  await expect(valor).toBeVisible();
  expect(await valor.evaluate((elemento) => getComputedStyle(elemento).color)).toBe("rgb(74, 222, 128)");

  for (const nome of TELAS) {
    await abrirTela(page, nome);
    const grandes = await page.evaluate(() => {
      // O token é uma referência a outro token: mede-se o tamanho já resolvido por um elemento de prova.
      const prova = document.createElement("span");
      prova.style.fontSize = "var(--numero-heroi)";
      document.body.append(prova);
      const limite = parseFloat(getComputedStyle(prova).fontSize);
      prova.remove();
      return Array.from(document.querySelectorAll<HTMLElement>(".valor"))
        .filter((elemento) => elemento.getClientRects().length > 0)
        .filter((elemento) => parseFloat(getComputedStyle(elemento).fontSize) >= limite - 0.5).length;
    });
    expect(grandes, `números em tamanho herói em ${nome}`).toBeLessThanOrEqual(1);
  }
});

test("o texto de apoio, os selos e os botões têm contraste de pelo menos 4,5 (SC-004)", async ({ page }) => {
  await entrar(page);
  for (const nome of TELAS) {
    await abrirTela(page, nome);
    const botoes = page.locator("main button:visible:not([disabled])").filter({ hasText: /\S/ });
    const quantos = Math.min(await botoes.count(), 6);
    for (let i = 0; i < quantos; i += 1) {
      const botao = botoes.nth(i);
      expect(await contrasteDoTexto(botao), `botão "${(await botao.textContent())?.trim()}" em ${nome}`).toBeGreaterThanOrEqual(4.5);
    }
    const apoio = page.locator("main [data-badge]:visible");
    const selos = Math.min(await apoio.count(), 6);
    for (let i = 0; i < selos; i += 1) {
      expect(await contrasteDoTexto(apoio.nth(i)), `selo em ${nome}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("a parte tirada da pizza continua legível: texto em Bruma, sem opacidade (SC-004)", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Investimentos");
  const partes = page.getByRole("button", { name: /^Mostrar no gráfico:/ });
  await partes.first().click();
  await expect(partes.first()).toHaveAttribute("aria-pressed", "false");
  const item = page.locator('[data-fora="true"]').first();
  expect(await item.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  for (const parte of ["nome", "valor", "percentual"]) {
    const texto = item.locator(`[class*="${parte}"]`).first();
    expect(await contrasteDoTexto(texto), parte).toBeGreaterThanOrEqual(4.5);
  }
});
