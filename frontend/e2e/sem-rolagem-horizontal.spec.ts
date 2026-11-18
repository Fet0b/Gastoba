import { expect, test, type Page } from "@playwright/test";

import { entrar, irPara } from "./apoio";

// Nenhuma tela pode ter rolagem horizontal em nenhuma largura entre 320px e 1920px. O projeto
// "celular" emula toque em 320px; aqui as larguras são todas definidas à mão, então só o projeto
// de desktop roda este arquivo.
const LARGURAS = [320, 375, 600, 768, 820, 1024, 1100, 1180, 1280, 1440, 1920];
const TELAS = ["Início", "Transações", "Orçamento", "Contas", "Investimentos", "Tags", "Recorrências"];

test.skip(({ isMobile }) => isMobile, "as larguras são definidas pelo próprio teste");

/**
 * Dados que enchem as telas como na vida real: renda-base e metas (o card da meta e a "Renda e
 * projeção" ganham conteúdo), gastos em várias categorias, e investimentos de renda fixa com
 * destinações (a tabela e os cartões aninhados de Investimentos).
 */
async function semear(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const m = "/src/simulacao/manipuladores.ts";
    const c = "/src/api/cliente.ts";
    const u = "/src/api/useConsulta.ts";
    const sim = (await import(/* @vite-ignore */ m)) as typeof import("../src/simulacao/manipuladores");
    const { chamar } = (await import(/* @vite-ignore */ c)) as {
      chamar: (caminho: string, opcoes?: { metodo?: string; corpo?: unknown }) => Promise<unknown>;
    };
    const cenario = sim.prepararCenarioLiberdadeFinanceira({ data: "2026-10-15" });
    sim.adicionarInvestimentoSimulado({
      nome: "CDB Banco com um nome bem comprido 2031",
      tipo: "FIXED_INCOME",
      subtipo: "CDB",
      saldo: "5387.04",
      valor_aplicado: "5000.00",
      rendimento: "387.04",
    });
    sim.adicionarInvestimentoSimulado({ nome: "LCI do banco", tipo: "FIXED_INCOME", subtipo: "LCI_LCA", saldo: "1200.00" });
    await chamar("/renda-base", { metodo: "PUT", corpo: { valor: "5387.04" } });
    for (const [categoria, percentual] of [["liberdade_financeira", 10], ["conforto", 20], ["lazer", 20], ["gasto_fixo", 25]] as const) {
      await chamar(`/metas/${categoria}`, { metodo: "PUT", corpo: { percentual } });
    }
    for (const [categoria, valor] of [["lazer", "423.00"], ["conforto", "1560.00"], ["gasto_fixo", "1400.00"]] as const) {
      await chamar("/gastos", {
        metodo: "POST",
        corpo: { conta_id: cenario.contaId, valor, descricao: `Exemplo ${categoria}`, data: "2026-10-15", categoria, tags: ["casa", "mercado"] },
      });
    }
    ((await import(/* @vite-ignore */ u)) as { invalidar: (p: string) => void }).invalidar("");
  });
}

async function folgaHorizontal(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

for (const largura of LARGURAS) {
  test(`nenhuma tela rola de lado em ${largura}px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await entrar(page);
    await semear(page);

    for (const tela of TELAS) {
      // O Início já é a tela em que a entrada termina (o título dele é a frase "Seu mês, com clareza.").
      if (tela !== "Início") await irPara(page, tela);
      await page.waitForTimeout(150);
      await expect.poll(() => folgaHorizontal(page), `${tela} em ${largura}px`).toBeLessThanOrEqual(0);
    }
  });
}

for (const largura of [320, 375, 600]) {
  test(`o fim de cada tela não fica atrás do botão Novo gasto em ${largura}px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 700 });
    await entrar(page);
    await semear(page);

    for (const tela of TELAS) {
      if (tela !== "Início") await irPara(page, tela);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(150);
      const botao = page.getByRole("button", { name: /^Novo gasto/ }).first();
      if (!(await botao.isVisible())) continue;
      const caixaDoBotao = await botao.boundingBox();
      const fimDoConteudo = await page.evaluate(() => {
        const principal = document.querySelector("main");
        const ultimo = principal?.lastElementChild;
        return ultimo ? ultimo.getBoundingClientRect().bottom : 0;
      });
      expect(fimDoConteudo, `${tela} em ${largura}px`).toBeLessThanOrEqual(caixaDoBotao!.y);
    }
  });
}
