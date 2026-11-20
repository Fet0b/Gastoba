import { expect, test, type Locator, type Page } from "@playwright/test";

/** Cada carregamento começa com exemplos fictícios e sem sessão. */
/** `caminho` abre direto numa rota (link direto); a tela de entrar aparece antes e a rota vale depois. */
export async function entrar(page: Page, caminho = "/"): Promise<void> {
  const origem = new URL(test.info().project.use.baseURL ?? "http://localhost:5173").origin;
  await page.route("**/*", (rota) =>
    new URL(rota.request().url()).origin === origem
      ? rota.continue()
      : rota.abort("blockedbyclient"),
  );
  await page.clock.setFixedTime(new Date(2026, 9, 29, 12));
  await page.goto(caminho);
  await page.getByLabel("E-mail", { exact: true }).fill("voce@exemplo.com");
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-exemplo-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  if (caminho === "/") await expect(page.getByRole("heading", { name: "Metas do mês" })).toBeVisible();
}

export async function irPara(page: Page, nome: string): Promise<void> {
  const botao = page.getByRole("navigation", { name: "Telas" }).getByRole("link", { name: nome, exact: true });
  if (await botao.count()) await botao.click();
  else {
    await page.getByRole("button", { name: "Mais", exact: true }).click();
    await page.getByRole("dialog", { name: "Mais telas" }).getByRole("link", { name: nome, exact: true }).click();
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

/**
 * Mais caixinhas fictícias na simulação (077), além de "reserva" e "viagem" que ela já traz com
 * posições: "casa" (casa, céu), uma com nome de 30 caracteres (para o corte) e "rascunho", sem uso
 * (a única que pode ser excluída). Só dados inventados; invalida o cache para a tela ler de novo.
 */
export async function semearCaixinhas(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const c = "/src/api/cliente.ts";
    const u = "/src/api/useConsulta.ts";
    const { chamar } = (await import(/* @vite-ignore */ c)) as {
      chamar: (caminho: string, opcoes?: { metodo?: string; corpo?: unknown }) => Promise<unknown>;
    };
    // Sem nenhum GET aqui: nos estados "vazio" e "carregando" da auditoria a leitura é adulterada.
    for (const corpo of [
      { nome: "casa", icone: "casa", cor: "ceu" },
      { nome: "viagem de ferias para a europa", icone: "aviao", cor: "menta" },
      { nome: "rascunho" },
    ]) {
      await chamar("/destinacoes-cadastradas", { metodo: "POST", corpo });
    }
    ((await import(/* @vite-ignore */ u)) as { invalidar: (p: string) => void }).invalidar("");
  });
}
