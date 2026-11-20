import { expect, test, type Page } from "@playwright/test";

import { instalarEstado } from "./auditoria/estados";
import { entrar, irPara, semearCaixinhas } from "./apoio";

// Frente 077 (ampliação): a tela Caixinhas. Desktop e celular; dados inventados, na simulação.

const cartao = (page: Page, nome: RegExp | string) => page.getByRole("group", { name: "Caixinhas", exact: true }).getByRole("button", { name: nome });
const viagem = (page: Page) => cartao(page, /^Viagem\b/).first();

async function abrirTelaComDados(page: Page) {
  await entrar(page);
  await semearCaixinhas(page);
  await irPara(page, "Caixinhas");
  await expect(viagem(page)).toBeVisible();
}

test("a tela Caixinhas tem rota própria e, sem caixinhas, mostra só o estado vazio com uma ação", async ({ page }) => {
  await instalarEstado(page, "vazio");
  await entrar(page);
  await irPara(page, "Caixinhas");

  await expect(page).toHaveURL(/\/caixinhas$/);
  await expect(page.getByRole("heading", { level: 2, name: "Caixinhas", exact: true })).toBeVisible();
  await expect(page.getByText("Nenhuma caixinha ainda", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar caixinha", exact: true })).toHaveCount(1);
});

test("cria uma caixinha com cor e ícone e o cartão aparece", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Caixinhas");

  await page.getByRole("button", { name: "Criar caixinha", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Criar caixinha" });
  await dialogo.getByLabel("Nome", { exact: true }).fill("Carro novo");
  await dialogo.getByLabel("Coral", { exact: true }).check({ force: true });
  await dialogo.getByLabel("Avião", { exact: true }).check({ force: true });
  await dialogo.getByRole("button", { name: "Salvar caixinha" }).click();

  await expect(dialogo).toBeHidden();
  const novo = cartao(page, /^Carro novo/);
  await expect(novo).toBeVisible();
  await expect(novo.locator("[data-parte='icone']")).toHaveAttribute("data-cor", "coral");
  await expect(novo).toContainText("R$\u00a00,00");
});

test("com dados: o cartão abre o detalhe e o total da tabela é o valor do cartão", async ({ page }) => {
  await abrirTelaComDados(page);
  const cartaoDaViagem = viagem(page);
  await expect(cartaoDaViagem).toHaveAttribute("aria-expanded", "false");

  await cartaoDaViagem.click();

  await expect(cartaoDaViagem).toHaveAttribute("aria-expanded", "true");
  const painel = page.getByRole("region", { name: "Investimentos em Viagem" });
  await expect(painel).toBeVisible();
  const valor = (await cartaoDaViagem.locator("[data-parte='valor']").innerText()).trim();
  const total = painel.locator("tr:has-text('Total'), li:has-text('Total')");
  await expect(total).toContainText(valor);

  await cartaoDaViagem.click();
  await expect(painel).toBeHidden();
});

test("o nome de trinta letras é cortado com reticências e fica inteiro no title", async ({ page }) => {
  await abrirTelaComDados(page);

  const longo = page.locator("[data-parte='nome']", { hasText: "Viagem de ferias para a europa" });
  await expect(longo).toHaveAttribute("title", "viagem de ferias para a europa");
  const { cortado, largura } = await longo.evaluate((e) => ({ cortado: getComputedStyle(e).textOverflow, largura: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  expect(cortado).toBe("ellipsis");
  expect(largura).toBeLessThanOrEqual(0);
});

test("muda o ícone e a cor pelo menu do cartão", async ({ page }) => {
  await abrirTelaComDados(page);

  await page.getByRole("button", { name: "Mais ações de casa", exact: true }).click();
  await page.getByRole("menuitem", { name: "Mudar ícone e cor" }).click();
  const dialogo = page.getByRole("dialog", { name: "Mudar ícone e cor de Casa" });
  await expect(dialogo.getByLabel("Casa", { exact: true })).toBeChecked();
  await expect(dialogo.getByRole("button", { name: "Salvar" })).toBeDisabled();
  await dialogo.getByLabel("Carro", { exact: true }).check({ force: true });
  await dialogo.getByLabel("Esmeralda", { exact: true }).check({ force: true });
  await dialogo.getByRole("button", { name: "Salvar" }).click();

  await expect(dialogo).toBeHidden();
  await expect(cartao(page, /^Casa/).locator("[data-parte='icone']")).toHaveAttribute("data-cor", "esmeralda");
  await expect(page.getByRole("button", { name: "Mais ações de casa", exact: true })).toBeFocused();
});

test("exclui uma caixinha sem uso e recusa a que está em uso", async ({ page }) => {
  await abrirTelaComDados(page);

  await page.getByRole("button", { name: "Mais ações de rascunho", exact: true }).click();
  await page.getByRole("menuitem", { name: "Excluir caixinha" }).click();
  const confirmar = page.getByRole("dialog", { name: "Excluir rascunho?" });
  await expect(confirmar.getByRole("button", { name: "Cancelar" })).toBeFocused();
  await confirmar.getByRole("button", { name: "Excluir definitivamente" }).click();
  await expect(cartao(page, /^Rascunho/)).toHaveCount(0);

  await page.getByRole("button", { name: "Mais ações de viagem", exact: true }).click();
  await page.getByRole("menuitem", { name: "Excluir caixinha" }).click();
  const emUso = page.getByRole("dialog", { name: "Excluir Viagem?" });
  await expect(emUso).toContainText("Esta caixinha tem investimentos e não pode ser excluída. Realoque-os primeiro.");
  await expect(emUso.getByRole("button", { name: "Excluir definitivamente" })).toBeDisabled();
  await expect(emUso.getByRole("button", { name: "Cancelar" })).toBeFocused();
  await emUso.getByRole("button", { name: "Cancelar" }).click();
  await expect(viagem(page)).toBeVisible();
});

test("Investimentos leva a Caixinhas pelo link Ver caixinhas", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Investimentos");

  await page.getByRole("button", { name: "Ver caixinhas", exact: true }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Caixinhas", exact: true })).toBeVisible();
});

test("o cartão é todo clicável, o valor fica na borda direita e o painel cabe na tela com foco no título", async ({ page }) => {
  await abrirTelaComDados(page);
  const cartaoDaViagem = viagem(page);
  const caixas = await cartaoDaViagem.evaluate((botao) => {
    const cartao = botao.parentElement!.getBoundingClientRect();
    const b = botao.getBoundingClientRect();
    const valor = botao.querySelector("[data-parte='valor']")!.getBoundingClientRect();
    const menu = botao.parentElement!.querySelector("[data-parte='menu']")!.getBoundingClientRect();
    const nome = botao.querySelector("[data-parte='nome']")!.getBoundingClientRect();
    return { cartao, b, valor, menu, nome };
  });
  expect(Math.abs(caixas.b.width - caixas.cartao.width)).toBeLessThan(2.5);
  expect(Math.abs(caixas.b.height - caixas.cartao.height)).toBeLessThan(2.5);
  expect(caixas.cartao.right - caixas.valor.right).toBeLessThanOrEqual(24);
  expect(caixas.menu.bottom).toBeLessThanOrEqual(caixas.nome.bottom + 24);

  await cartaoDaViagem.click();
  const painel = page.getByRole("region", { name: "Investimentos em Viagem" });
  await expect(page.getByRole("heading", { name: "Investimentos em Viagem" })).toBeFocused();
  await expect(painel).toBeInViewport();
  const folga = await painel.evaluate((e) => ({ dentro: e.scrollWidth - e.clientWidth, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  expect(folga.dentro).toBeLessThanOrEqual(0);
  expect(folga.doc).toBeLessThanOrEqual(0);
  await cartaoDaViagem.click();
  await expect(cartaoDaViagem).toBeFocused();
});

test("sem investimentos o cartão diz 'Sem investimentos' e o valor aparece uma vez", async ({ page }) => {
  await abrirTelaComDados(page);

  const rascunho = cartao(page, /^Rascunho/);
  await expect(rascunho.locator("[data-parte='rendimento']")).toHaveText("Sem investimentos");
  expect(((await rascunho.innerText()).match(/R\$/g) ?? []).length).toBe(1);
});

test("no celular, com a caixinha aberta, a linha Total fica visível e não coberta pela barra de abas nem pelo Novo gasto", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await abrirTelaComDados(page);
  await viagem(page).click();

  const painel = page.getByRole("region", { name: "Investimentos em Viagem" });
  const total = painel.locator("tr:has-text('Total'), li:has-text('Total')");
  await expect(total).toBeInViewport({ ratio: 1 });
  await expect.poll(() => total.evaluate((e) => {
    const r = e.getBoundingClientRect();
    const pontos = [[r.left + 8, r.top + r.height / 2], [r.right - 8, r.top + r.height / 2], [r.left + r.width / 2, r.bottom - 2]];
    return pontos.every(([x, y]) => e.contains(document.elementFromPoint(x!, y!)));
  })).toBe(true);
});
