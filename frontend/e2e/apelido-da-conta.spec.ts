import { expect, test, type Page } from "@playwright/test";
import { entrar, irPara } from "./apoio";

const TELAS = ["Início", "Transações", "Orçamento", "Contas", "Investimentos", "Caixinhas", "Faturas", "Tags", "Recorrências", "Perfil"];

async function criarContaManual(page: Page, nome: string): Promise<void> {
  await page.getByRole("button", { name: "Nova conta", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Nova conta" });
  await dialogo.getByLabel("Nome", { exact: true }).fill(nome);
  // Com saldo, a conta não fica recolhida em "contas sem saldo".
  await dialogo.getByLabel("Saldo inicial", { exact: true }).fill("1000");
  await dialogo.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(dialogo).toBeHidden();
}

async function abrirApelido(page: Page, conta: string, item: "Dar apelido" | "Mudar apelido") {
  await page.getByRole("button", { name: `Mais ações da conta ${conta}, Conta corrente`, exact: true }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: item, exact: true });
  await expect(dialogo).toBeVisible();
  return dialogo;
}

test("dar, trocar e remover o apelido de uma conta", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Contas");
  await criarContaManual(page, "Reserva do teste");

  const dialogo = await abrirApelido(page, "Reserva do teste", "Dar apelido");
  await expect(dialogo.getByText("O apelido aparece no lugar do nome da conta.")).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Salvar apelido", exact: true })).toBeDisabled();
  await dialogo.getByLabel("Apelido", { exact: true }).fill("Conta da casa");
  await dialogo.getByRole("button", { name: "Salvar apelido", exact: true }).click();
  await expect(dialogo).toBeHidden();
  await expect(page.getByText("Apelido salvo.")).toBeVisible();
  await expect(page.locator("main [data-rotulo]", { hasText: "Conta da casa" })).toBeVisible();

  const troca = await abrirApelido(page, "Conta da casa", "Mudar apelido");
  await expect(troca.getByLabel("Apelido", { exact: true })).toHaveValue("Conta da casa");
  await troca.getByLabel("Apelido", { exact: true }).fill("Casa");
  await troca.getByRole("button", { name: "Salvar apelido", exact: true }).click();
  await expect(troca).toBeHidden();
  await expect(page.locator("main [data-rotulo]", { hasText: /^Casa$/ })).toBeVisible();

  const remocao = await abrirApelido(page, "Casa", "Mudar apelido");
  await remocao.getByRole("button", { name: "Remover apelido", exact: true }).click();
  const confirmacao = page.getByRole("dialog", { name: "Remover o apelido Casa?" });
  await expect(confirmacao.getByRole("button", { name: "Cancelar", exact: true })).toBeFocused();
  await confirmacao.getByRole("button", { name: "Confirmar remoção", exact: true }).click();
  await expect(confirmacao).toBeHidden();
  await expect(page.getByText("Apelido removido.")).toBeVisible();
  await expect(page.locator("main [data-rotulo]", { hasText: "Reserva do teste" })).toBeVisible();
});

test("apelido repetido mostra o erro junto ao campo", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Contas");
  await criarContaManual(page, "Alfa do teste");
  await criarContaManual(page, "Beta do teste");

  const primeiro = await abrirApelido(page, "Alfa do teste", "Dar apelido");
  await primeiro.getByLabel("Apelido", { exact: true }).fill("Casa");
  await primeiro.getByRole("button", { name: "Salvar apelido", exact: true }).click();
  await expect(primeiro).toBeHidden();

  const segundo = await abrirApelido(page, "Beta do teste", "Dar apelido");
  await segundo.getByLabel("Apelido", { exact: true }).fill("Casa");
  await segundo.getByRole("button", { name: "Salvar apelido", exact: true }).click();
  await expect(segundo.getByRole("alert")).toHaveText("Você já tem uma conta com esse apelido.");
  await expect(segundo).toBeVisible();
});

test("nenhuma tela mostra '(N)' nem o sufixo interno para conta importada", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Contas");
  // Uma conta manual com o nome do banco obriga a importada a nascer com o sequencial interno.
  await criarContaManual(page, "Conta Corrente");
  await irPara(page, "Transações");
  await page.getByRole("button", { name: /^Caixa de entrada/ }).click();
  await page.getByRole("button", { name: "Sincronizar agora", exact: true }).click();
  await expect(page.getByRole("listitem", { name: "Mercado Extra", exact: true })).toBeVisible();

  for (const nome of TELAS) {
    if (nome !== "Início") await irPara(page, nome);
    const texto = await page.locator("main").innerText();
    expect(texto, `tela ${nome}`).not.toMatch(/\(banco-\)|\b(?:Conta Corrente|Visa Gold) \(\d+\)/);
  }
  await irPara(page, "Contas");
  await expect(page.getByText("final 0412").first()).toBeVisible();
});

test("apelido de 40 caracteres corta com reticências e não cobre o menu do cartão", async ({ page }) => {
  const longo = "Conta corrente do trabalho e das viagens";
  await entrar(page);
  await irPara(page, "Contas");
  await criarContaManual(page, "Reserva do teste");
  const dialogo = await abrirApelido(page, "Reserva do teste", "Dar apelido");
  await dialogo.getByLabel("Apelido", { exact: true }).fill(longo);
  await dialogo.getByRole("button", { name: "Salvar apelido", exact: true }).click();
  await expect(dialogo).toBeHidden();

  const rotulo = page.locator("main [data-rotulo]", { hasText: longo });
  await expect(rotulo).toBeVisible();
  await expect(rotulo).toHaveAttribute("title", longo);
  const menu = page.getByRole("button", { name: /^Mais ações da conta Conta corrente do trabalho/ });
  const caixaDoRotulo = (await rotulo.boundingBox())!;
  const caixaDoMenu = (await menu.boundingBox())!;
  // O texto corta (reticências) e termina antes do menu: nunca por baixo dele.
  const reservaDoMenu = await rotulo.evaluate((e) => parseFloat(getComputedStyle(e).paddingInlineEnd));
  expect(caixaDoRotulo.x + caixaDoRotulo.width - reservaDoMenu).toBeLessThanOrEqual(caixaDoMenu.x);
  const item = (await page.locator("main li").filter({ hasText: longo }).first().boundingBox())!;
  expect(caixaDoRotulo.x + caixaDoRotulo.width).toBeLessThanOrEqual(item.x + item.width);
});

test("filtro Contas em Transações: a opção mostra o final sem corte no computador", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1000, "a lista suspensa só existe no computador");
  await entrar(page);
  await irPara(page, "Transações");
  // A sincronização simulada cria a conta importada, que traz o final 0412.
  await page.getByRole("button", { name: /^Caixa de entrada/ }).click();
  await page.getByRole("button", { name: "Sincronizar agora", exact: true }).click();
  await expect(page.getByRole("listitem", { name: "Mercado Extra", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Gastos/ }).click();
  await page.getByRole("button", { name: /^Contas:/ }).click();
  const opcao = page.getByRole("group", { name: "Contas" }).locator("label span[data-truncar]", { hasText: "final 0412" }).first();
  await expect(opcao).toBeVisible();
  const corte = await opcao.evaluate((e) => ({ largura: e.scrollWidth - e.clientWidth, altura: e.scrollHeight - e.clientHeight }));
  expect(corte.largura).toBeLessThanOrEqual(0);
  expect(corte.altura).toBeLessThanOrEqual(0);
  // A lista inteira cabe na janela (não passa da borda direita).
  const lista = (await page.getByRole("group", { name: "Contas" }).boundingBox())!;
  expect(lista.x + lista.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
