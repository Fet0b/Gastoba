import { expect, test, type Page } from "@playwright/test";

import { entrar, irPara } from "./apoio";

const GUARDADO = /R\$\s*1\.000,00 guardados para comprar/;

/** Lazer com 20% de uma renda-base de R$ 10.000,00: limite de R$ 2.000,00. */
async function prepararMetaDeLazer(page: Page): Promise<void> {
  await irPara(page, "Orçamento");
  await page.getByRole("button", { name: "Editar metas", exact: true }).first().click();
  await page.getByLabel("Percentual da renda para Lazer", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Salvar meta", exact: true }).click();
  await expect(page.getByText("Meta salva.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mais ações da renda-base", exact: true }).click();
  await page.getByRole("menuitem", { name: "Definir renda-base", exact: true }).click();
  await page.getByLabel("Valor da renda-base mensal", { exact: true }).fill("1000000");
  await page.getByRole("button", { name: "Salvar renda-base", exact: true }).click();
  await expect(page.getByText("Renda-base salva.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Concluir", exact: true }).click();
}

/** Início não tem título de página: a tela se reconhece por "Metas do mês". */
async function irParaInicio(page: Page): Promise<void> {
  await page.getByRole("navigation", { name: "Telas" }).getByRole("link", { name: "Início", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Metas do mês" })).toBeVisible();
}

async function configurar(page: Page, ligar: boolean): Promise<void> {
  await irPara(page, "Perfil");
  const opcao = page.getByRole("checkbox", { name: "Mostrar nas metas o que guardei para comprar", exact: true });
  await expect(opcao).toBeVisible();
  if ((await opcao.isChecked()) !== ligar) await opcao.setChecked(ligar);
  if (ligar) {
    await page.getByRole("button", { name: /^Lazer:/ }).click();
    await page.getByRole("checkbox", { name: "Viagem", exact: true }).check();
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Configuração salva.", { exact: true })).toBeVisible();
}

test("liga o guardado, vê o rachurado no Orçamento e no Início e desliga", async ({ page }) => {
  await entrar(page);
  await prepararMetaDeLazer(page);

  // Desligado: nada de rachurado nem de texto.
  const linhaDoOrcamento = page.getByRole("listitem", { name: "Lazer", exact: true });
  await expect(linhaDoOrcamento).toBeVisible();
  await expect(page.locator("circle[data-rachurado]")).toHaveCount(0);
  await expect(page.getByText(/guardados para comprar/)).toHaveCount(0);

  // Ligar e marcar Viagem em Lazer: aporte de R$ 1.200,00 menos resgate de R$ 200,00 no mês.
  await configurar(page, true);
  await irPara(page, "Orçamento");
  await expect(linhaDoOrcamento).toContainText(GUARDADO);
  await expect(linhaDoOrcamento.getByText("Viagem", { exact: true })).toBeVisible();
  await expect(linhaDoOrcamento.locator("circle[data-rachurado]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Sobre o guardado para comprar", exact: true })).toBeVisible();
  // A rachura nunca vem sozinha: o nome acessível do anel diz o valor.
  await expect(linhaDoOrcamento.getByRole("img")).toHaveAttribute("aria-label", /guardados para comprar/);

  await irParaInicio(page);
  const linhaDoInicio = page.getByRole("listitem", { name: "Lazer", exact: true });
  await expect(linhaDoInicio).toContainText(GUARDADO);
  await expect(linhaDoInicio.locator("circle[data-rachurado]")).toHaveCount(1);

  // Desligar faz tudo sumir; as marcações ficam guardadas.
  await configurar(page, false);
  await irParaInicio(page);
  await expect(page.getByRole("listitem", { name: "Lazer", exact: true })).toBeVisible();
  await expect(page.getByText(/guardados para comprar/)).toHaveCount(0);
  await expect(page.locator("circle[data-rachurado]")).toHaveCount(0);
  await irPara(page, "Perfil");
  await page.getByRole("checkbox", { name: "Mostrar nas metas o que guardei para comprar", exact: true }).check();
  await expect(page.getByRole("button", { name: "Lazer: 1", exact: true })).toBeVisible();
});

test("classificar um aporte na caixinha marcada muda o anel sem recarregar", async ({ page }) => {
  await entrar(page);
  await prepararMetaDeLazer(page);
  await configurar(page, true);
  await irPara(page, "Orçamento");
  const linha = page.getByRole("listitem", { name: "Lazer", exact: true });
  await expect(linha).toContainText(GUARDADO);

  await irPara(page, "Transações");
  await page.getByRole("button", { name: "Caixa de entrada", exact: true }).click();
  await page.getByRole("button", { name: "Sincronizar agora", exact: true }).click();
  const cartao = page.getByRole("listitem", { name: "Mercado Extra", exact: true });
  await cartao.getByRole("radio", { name: "Aporte", exact: true }).check();
  await cartao.getByLabel("Investimento", { exact: true }).selectOption({ label: "LCI 100% CDI" });
  await cartao.getByLabel("Tag da destinação 1", { exact: true }).fill("viagem");
  await cartao.getByRole("button", { name: "Aceitar como aporte: Mercado Extra", exact: true }).click();
  await expect(cartao).toHaveCount(0);

  // Sem recarregar a página: R$ 1.000,00 mais o aporte de R$ 87,35.
  await irPara(page, "Orçamento");
  await expect(linha).toContainText(/R\$\s*1\.087,35 guardados para comprar/);
});

// Auditoria do Artigo XI.10 e capturas para revisão humana (1366 e 390 px), com o guardado ligado.
const AUDITORIA = (raiz: string) =>
  [...document.querySelectorAll(`${raiz} :is(select,input,textarea,button,summary,table,h1,h2,h3,h4,label)`)]
    .filter((e) => (e as HTMLElement).offsetParent && !e.className?.toString().trim())
    .map((e) => `${e.tagName}${(e as HTMLInputElement).type ? ":" + (e as HTMLInputElement).type : ""}`);

for (const largura of [1366, 390]) {
  test(`auditoria do design e captura do guardado em ${largura}px`, async ({ page }, info) => {
    test.skip(info.project.name === "celular", "a largura é definida pelo próprio teste");
    await page.setViewportSize({ width: largura, height: 900 });
    await entrar(page);
    await prepararMetaDeLazer(page);
    await configurar(page, true);

    const pasta = "test-results/guardado-nas-metas";
    await irPara(page, "Orçamento");
    await expect(page.getByRole("listitem", { name: "Lazer", exact: true })).toContainText(GUARDADO);
    expect(await page.evaluate(AUDITORIA, "main"), "Orçamento").toEqual([]);
    await page.screenshot({ path: `${pasta}/orcamento-${largura}.png`, fullPage: true });

    await irParaInicio(page);
    await expect(page.getByRole("listitem", { name: "Lazer", exact: true })).toContainText(GUARDADO);
    // Só as linhas das metas: o gráfico de ritmo do Início tem um <summary> sem classe anterior a esta frente.
    expect(await page.evaluate(AUDITORIA, "li[data-linha-da-meta]"), "Início").toEqual([]);
    await page.screenshot({ path: `${pasta}/inicio-${largura}.png`, fullPage: true });

    await irPara(page, "Perfil");
    await page.getByRole("button", { name: /^Lazer:/ }).click();
    await expect(page.getByRole("checkbox", { name: "Viagem", exact: true })).toBeVisible();
    expect(await page.evaluate(AUDITORIA, `section[aria-label="Guardado para comprar nas metas"]`), "Perfil").toEqual([]);
    await page.screenshot({ path: `${pasta}/perfil-${largura}.png`, fullPage: true });
  });
}
