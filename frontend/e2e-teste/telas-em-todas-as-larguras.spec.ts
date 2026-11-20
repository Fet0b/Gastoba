import { expect, test, type Page } from "@playwright/test";

import { irPara } from "../e2e/apoio";

// Todas as telas, em todas as larguras, contra o ambiente de teste populado (frente 067). O banco
// é fictício e o cenário tem dados em todas as telas; cada uma só passa se:
//   - não rolar de lado (scrollWidth <= clientWidth);
//   - não mostrar erro nem estado vazio onde o cenário tem dados;
//   - não gerar erro de console, erro de página nem resposta 4xx/5xx.
// As capturas de página inteira ficam em test-results/ para revisão humana (sem comparação por pixel).

const LARGURAS = [320, 360, 390, 430, 600, 768, 1024, 1280, 1366, 1536, 1920];
const PESSOA = { email: "teste@exemplo.com", senha: "senha-de-teste-123" }; // fictícia, só deste ambiente
const OUTRA_PESSOA = { email: "outra@exemplo.com", senha: "senha-de-teste-123" };

type Tela = {
  nome: string;
  /** A tela tem dados no cenário: um estado vazio aqui é defeito. */
  comDados: boolean;
  abrir?: (page: Page) => Promise<void>;
};

const TELAS: Tela[] = [
  { nome: "Início", comDados: true },
  { nome: "Transações", comDados: true },
  {
    nome: "Transações: caixa de entrada",
    comDados: true,
    abrir: async (page) => {
      await irPara(page, "Transações");
      await page.getByRole("button", { name: /caixa de entrada/i }).first().click();
    },
  },
  {
    nome: "Transações: aportes e resgates",
    comDados: true,
    abrir: async (page) => {
      await irPara(page, "Transações");
      await page.getByRole("button", { name: /aportes e resgates/i }).first().click();
    },
  },
  { nome: "Orçamento", comDados: true },
  { nome: "Contas", comDados: true },
  { nome: "Investimentos", comDados: true },
  { nome: "Faturas", comDados: true },
  { nome: "Tags", comDados: true },
  { nome: "Recorrências", comDados: true },
  { nome: "Perfil", comDados: true },
];

/** Só a origem do próprio ambiente: nada sai de localhost. */
async function bloquearForaDaOrigem(page: Page): Promise<void> {
  const origem = new URL(test.info().project.use.baseURL ?? "http://localhost:8180").origin;
  await page.route("**/*", (rota) =>
    new URL(rota.request().url()).origin === origem ? rota.continue() : rota.abort("blockedbyclient"),
  );
}

async function entrarNoAmbiente(page: Page, pessoa: { email: string; senha: string }): Promise<void> {
  await bloquearForaDaOrigem(page);
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill(pessoa.email);
  await page.getByLabel("Senha", { exact: true }).fill(pessoa.senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Metas do mês" })).toBeVisible();
}

/** Erros que a pessoa ou o desenvolvedor veriam: console, exceção da página e respostas 4xx/5xx. */
function observarErros(page: Page): string[] {
  const erros: string[] = [];
  page.on("console", (mensagem) => {
    // Violação de Content-Security-Policy é falha explícita (spec 075), em qualquer nível de log.
    if (/content security policy/i.test(mensagem.text())) {
      erros.push(`csp: ${mensagem.text().slice(0, 200)}`);
    } else if (mensagem.type() === "error") {
      erros.push(`console: ${mensagem.text().slice(0, 200)}`);
    }
  });
  page.on("pageerror", (erro) => erros.push(`pagina: ${erro.message.slice(0, 200)}`));
  page.on("response", (resposta) => {
    if (resposta.status() >= 400) {
      erros.push(`http ${resposta.status()}: ${new URL(resposta.url()).pathname}`);
    }
  });
  return erros;
}

async function folgaHorizontal(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function estadosVazios(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("main p")]
      .filter((p) => p.parentElement?.className.toString().includes("vazio"))
      .map((p) => (p.textContent ?? "").trim().slice(0, 60)),
  );
}

async function variaveisDeAparencia(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.documentElement.style].filter((n) => n.startsWith("--")));
}

async function carregar(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("status", { name: /carregando/i })).toHaveCount(0);
}

async function visitar(page: Page, tela: Tela, largura: number, sufixo: string): Promise<void> {
  if (tela.abrir) await tela.abrir(page);
  else if (tela.nome !== "Início") await irPara(page, tela.nome);
  await carregar(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect.poll(() => folgaHorizontal(page), `${tela.nome} em ${largura}px`).toBeLessThanOrEqual(0);
  if (tela.comDados) expect(await estadosVazios(page), `${tela.nome} em ${largura}px`).toEqual([]);
  const arquivo = `${tela.nome.replace(/\W+/g, "-")}-${largura}${sufixo}.png`;
  await page.screenshot({ path: test.info().outputPath(arquivo), fullPage: true, animations: "disabled" });
}

for (const largura of LARGURAS) {
  test(`as telas do cenário de teste em ${largura}px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await entrarNoAmbiente(page, PESSOA);
    const erros = observarErros(page);
    for (const tela of TELAS) await visitar(page, tela, largura, "");
    expect(erros).toEqual([]);
  });
}

// A pessoa do cenário tem aparência personalizada (cor, textura, nome e logo); a outra, a padrão.
// O Início e o Orçamento precisam se comportar igual nas duas.
for (const largura of [320, 390, 768, 1366]) {
  test(`Início e Orçamento com a aparência personalizada em ${largura}px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await entrarNoAmbiente(page, PESSOA);
    const erros = observarErros(page);
    // A aparência personalizada escreve variáveis no elemento raiz; a padrão não escreve nada.
    expect(await variaveisDeAparencia(page)).not.toEqual([]);
    for (const tela of TELAS.filter((t) => t.nome === "Início" || t.nome === "Orçamento")) {
      await visitar(page, tela, largura, "-personalizada");
    }
    expect(erros).toEqual([]);
  });

  test(`Início e Orçamento da outra pessoa, na aparência padrão, em ${largura}px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await entrarNoAmbiente(page, OUTRA_PESSOA);
    const erros = observarErros(page);
    expect(await variaveisDeAparencia(page)).toEqual([]);
    for (const tela of TELAS.filter((t) => t.nome === "Início" || t.nome === "Orçamento")) {
      await visitar(page, { ...tela, comDados: false }, largura, "-padrao");
    }
    expect(erros).toEqual([]);
  });
}
