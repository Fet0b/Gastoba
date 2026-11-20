import { expect, test } from "@playwright/test";

import { entrar, irPara } from "./apoio";

// Cada tela tem rota própria, o mês vai em ?mes= e o menu usa links. Dados fictícios, simulação local.

test("o menu usa links com o endereço de cada tela e a troca de tela muda a URL", async ({ page }) => {
  await entrar(page);
  await expect(page).toHaveURL(/\/inicio$/);
  await irPara(page, "Orçamento");
  await expect(page).toHaveURL(/\/orcamento$/);
  const link = page.getByRole("navigation", { name: "Telas" }).getByRole("link", { name: "Orçamento", exact: true });
  await expect(link).toHaveAttribute("href", "/orcamento");
  await expect(link).toHaveAttribute("aria-current", "page");
});

test("voltar e avançar do navegador trocam de tela", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Contas");
  await irPara(page, "Orçamento");
  await page.goBack();
  await expect(page).toHaveURL(/\/contas$/);
  await expect(page.getByRole("heading", { name: "Contas", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/orcamento$/);
  await expect(page.getByRole("heading", { name: "Orçamento", exact: true })).toBeVisible();
});

test("o mês vai na URL, acompanha a ida a outra tela mensal e o voltar o desfaz", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Orçamento");
  await page.getByRole("button", { name: "Mês anterior" }).click();
  await expect(page).toHaveURL(/\/orcamento\?mes=2026-09$/);
  await irPara(page, "Tags");
  await expect(page).toHaveURL(/\/tags\?mes=2026-09$/);
  await expect(page.getByRole("group", { name: "Período" })).toContainText("setembro de 2026");
  await page.goBack();
  await expect(page).toHaveURL(/\/orcamento\?mes=2026-09$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/orcamento$/);
});

test("um link direto com o mês abre a tela e o mês certos depois de entrar", async ({ page }) => {
  await entrar(page, "/orcamento?mes=2026-08");
  await expect(page.getByRole("heading", { name: "Orçamento", exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Período" })).toContainText("agosto de 2026");
});

test("recarregar numa rota mantém a tela (a simulação recomeça deslogada, então entra de novo)", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Contas");
  await page.reload();
  await page.getByLabel("E-mail", { exact: true }).fill("voce@exemplo.com");
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-exemplo-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/contas$/);
  await expect(page.getByRole("heading", { name: "Contas", exact: true })).toBeVisible();
});

test("um endereço desconhecido cai no Início", async ({ page }) => {
  await entrar(page);
  await page.goto("/nada-aqui");
  await page.getByLabel("E-mail", { exact: true }).fill("voce@exemplo.com");
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-exemplo-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/inicio$/);
});
