import { expect, test } from "@playwright/test";
import { entrar, irPara } from "./apoio";

for (const largura of [1366, 390]) {
  test(`operações manuais e abertura em ${largura}px`, async ({ page }, info) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await entrar(page);
    await page.evaluate(async () => {
      const caminho = "/src/simulacao/manipuladores.ts";
      const sim = await import(/* @vite-ignore */ caminho) as typeof import("../src/simulacao/manipuladores");
      const id = sim.adicionarInvestimentoSimulado({ nome: "Fundo de teste", tipo: "EQUITY", saldo: "120.00", faltam_cotas: "2" });
      sim.adicionarOperacaoSimulada(id, { tipo: "ABERTURA", data: "2026-10-01", quantidade: "1", valor: "50.00", origem: "abertura", quantidade_estimada: true });
      const cache = "/src/api/useConsulta.ts";
      (await import(/* @vite-ignore */ cache) as typeof import("../src/api/useConsulta")).invalidar("investimentos");
    });
    await irPara(page, "Investimentos");
    // Os grupos abrem sob demanda; localizar a posição mantém a composição da página.
    const grupo = page.getByRole("button", { name: /Renda variável/ });
    if (await grupo.count()) await grupo.click();
    const linha = page.getByRole("listitem", { name: "Fundo de teste", exact: true });
    await linha.getByRole("button", { name: /Mais ações/ }).click();
    await page.getByRole("menuitem", { name: "Ver operações e abertura" }).click();
    await page.getByRole("button", { name: "Editar abertura", exact: true }).click();
    const formulario = page.getByRole("dialog", { name: "Editar operação", exact: true });
    await expect(formulario.getByText(/Quantidade estimada/)).toBeVisible();
    await formulario.getByLabel("Quantidade", { exact: true }).fill("2");
    await formulario.getByRole("button", { name: "Salvar operação" }).click();
    await expect(formulario).toHaveCount(0);
    await page.getByRole("button", { name: "Excluir abertura", exact: true }).click();
    const confirmacao = page.getByRole("dialog", { name: "Excluir a abertura?", exact: true });
    await expect(confirmacao.getByRole("button", { name: "Cancelar" })).toBeFocused();
    await confirmacao.getByRole("button", { name: "Confirmar exclusão" }).click();
    await expect(page.getByText("Nenhuma operação ainda", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`operacoes-${largura}-vazio.png`), fullPage: true });
    await page.getByRole("dialog", { name: /^Operações de/ }).getByRole("button", { name: "Lançar operação" }).click();
    const nova = page.getByRole("dialog", { name: "Lançar operação", exact: true });
    await nova.getByLabel("Quantidade", { exact: true }).fill("2.5");
    await nova.getByLabel("Valor bruto (R$)").fill("10000");
    const achados = await nova.locator("select,input,textarea,button,summary,table,h1,h2,h3,h4,label").evaluateAll(elementos => elementos.filter(e => !e.className.toString().trim()).map(e => e.tagName));
    expect(achados).toEqual([]);
    const medidas = await nova.evaluate(e => ({ esquerda: e.getBoundingClientRect().left, direita: e.getBoundingClientRect().right, largura: innerWidth }));
    expect(medidas.esquerda).toBeGreaterThanOrEqual(0);
    expect(medidas.direita).toBeLessThanOrEqual(medidas.largura);
    await page.screenshot({ path: info.outputPath(`operacoes-${largura}-formulario.png`), fullPage: true });
    await nova.getByRole("button", { name: "Lançar operação", exact: true }).click();
    await expect(nova).toHaveCount(0);
    await expect(page.getByText("2.5 cotas", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`operacoes-${largura}-dados.png`), fullPage: true });
  });
}

for (const largura of [1366, 390]) {
  test(`operações: carregamento e erro em ${largura}px`, async ({ page }, info) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await entrar(page);
    await page.evaluate(() => {
      const original = window.fetch.bind(window);
      window.fetch = async (entrada, opcoes) => {
        if (String(entrada).endsWith("/operacoes")) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return new Response(JSON.stringify({ erro: { codigo: "erro_interno", mensagem: "Não foi possível consultar." } }), { status: 500 });
        }
        return original(entrada, opcoes);
      };
    });
    await irPara(page, "Investimentos");
    await page.getByRole("button", { name: /Mais ações de/ }).first().click();
    await page.getByRole("menuitem", { name: "Ver operações e abertura" }).click();
    await expect(page.getByRole("status", { name: "Carregando operações", exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`operacoes-${largura}-carregando.png`), fullPage: true });
    await expect(page.getByText("Não foi possível carregar as operações.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
  });
}

for (const largura of [1366, 390]) {
  test(`caixinhas, pendências e aportes preservados em ${largura}px`, async ({ page }, info) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await entrar(page);
    await page.evaluate(async () => {
      const caminho = "/src/simulacao/manipuladores.ts";
      const sim = await import(/* @vite-ignore */ caminho) as typeof import("../src/simulacao/manipuladores");
      const id = sim.adicionarInvestimentoSimulado({ nome: "Fundo para alocar", tipo: "EQUITY", saldo: "150.00", pendencias_de_operacoes: [{ tipo: "AMORTIZATION", data: "2026-10-03", motivo: "tipo_sem_traducao" }] });
      sim.definirAlocacoesSimuladas(id, { viagem: "100.00" }, "50.00");
      sim.adicionarAporteSemInvestimentoSimulado();
      const cache = "/src/api/useConsulta.ts";
      (await import(/* @vite-ignore */ cache) as typeof import("../src/api/useConsulta")).invalidar("");
    });
    await irPara(page, "Investimentos");
    const linha = page.getByRole("listitem", { name: "Fundo para alocar", exact: true });
    await expect(linha.getByText(/Sem caixinha:/)).toBeVisible();
    await linha.getByRole("button", { name: /Mais ações/ }).click();
    await page.getByRole("menuitem", { name: "Alocar em caixinhas" }).click();
    const dialogo = page.getByRole("dialog", { name: /Definir destinações de Fundo para alocar/ });
    await dialogo.getByLabel("Tag da destinação 1").fill("viagem");
    await dialogo.getByRole("button", { name: "Salvar caixinhas" }).click();
    await expect(dialogo).toHaveCount(0);
    await expect(linha.getByText(/Sem caixinha:/)).toHaveCount(0);
    await linha.getByText("Pendências de operações (1)", { exact: true }).click();
    await expect(linha.getByText(/não foi traduzido/)).toBeVisible();
    await page.getByRole("button", { name: "Revisar aportes" }).click();
    const aportes = page.getByRole("dialog", { name: "Revisar aportes sem investimento", exact: true });
    await aportes.getByRole("button", { name: /Mais ações do aporte/ }).click();
    await page.getByRole("menuitem", { name: "Excluir", exact: true }).click();
    const confirmacao = page.getByRole("dialog", { name: "Excluir este aporte?" });
    await expect(confirmacao.getByText(/totais só mudam depois/)).toBeVisible();
    await confirmacao.getByRole("button", { name: "Confirmar exclusão" }).click();
    await expect(aportes.getByText(/aguarda a sua confirmação/)).toBeVisible();
    await page.screenshot({ path: info.outputPath(`aportes-caixinhas-${largura}.png`), fullPage: true });
    await aportes.getByRole("button", { name: /Mais ações do aporte/ }).click();
    await page.getByRole("menuitem", { name: "Desfazer tratamento" }).click();
    await page.getByRole("button", { name: "Confirmar desfazer" }).click();
    await expect(aportes.getByText(/aguarda a sua confirmação/)).toHaveCount(0);
  });
}
